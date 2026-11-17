import type { Pool } from 'pg';
import type { ProductSearch } from './productSearch.schema.js';
import type { ProductSearchItem, ProductSearchRepository } from './productSearch.service.js';

interface SearchTerms { skuKey: string; tsquery: string }
export async function loadProductSearchTerms(pool: Pick<Pool, 'query'>, query: string): Promise<SearchTerms> {
  const result = await pool.query<SearchTerms>("SELECT catalog_internal.normalize($1) AS \"skuKey\",coalesce(catalog_internal.search_query($1)::text,'') AS tsquery", [query]);
  return result.rows[0]!;
}

export function buildProductSearchQuery(search: ProductSearch, terms?: SearchTerms) {
  const values: (string | number | boolean | null)[] = [];
  const conditions = ["p.status='published'", 'c.is_active', '(b.id IS NULL OR b.is_active)'];
  const parameter = (value: string | number | boolean | null) => {
    values.push(value);
    return `$${values.length}`;
  };
  let candidates: string;
  if (search.q) {
    if (!terms) throw new Error('Search terms must be normalized before building a query');
    candidates = `SELECT id FROM catalog_internal.search_product_ids(
      ${parameter(terms.skuKey)},${parameter(terms.tsquery)}::tsquery,
      ${parameter(search.categoryId ?? null)}::uuid,${parameter(search.brandId ?? null)}::uuid,
      ${parameter(search.featured ?? null)}::boolean,${parameter(search.after ?? null)}::text) AS ids(id)`;
  } else {
    if (search.categoryId) conditions.push(`p.category_id=${parameter(search.categoryId)}::uuid`);
    if (search.brandId) conditions.push(`p.brand_id=${parameter(search.brandId)}::uuid`);
    if (search.featured !== undefined) conditions.push(`p.is_featured=${parameter(search.featured)}`);
    if (search.after) conditions.push(`p.id>${parameter(search.after)}`);
    candidates = `SELECT p.id FROM public.products p JOIN public.categories c ON c.id=p.category_id
      LEFT JOIN public.brands b ON b.id=p.brand_id WHERE ${conditions.join(' AND ')}`;
  }
  const limit = parameter(search.limit + 1);
  return {
    text: `WITH matching AS MATERIALIZED (${candidates}
    ), page AS (SELECT id FROM matching ORDER BY id LIMIT ${limit})
    SELECT p.id,p.sku,p.name,c.name AS category,coalesce(b.name,'') AS brand,p.presentation,
      p.price_in_cents AS "priceInCents",p.currency,p.available_quantity AS "availableQuantity",
      p.available_quantity>0 AS "inStock",p.requires_prescription AS "requiresPrescription",p.is_featured AS "isFeatured",
      image.metadata AS image
      FROM page JOIN public.products p ON p.id=page.id JOIN public.categories c ON c.id=p.category_id
      LEFT JOIN public.brands b ON b.id=p.brand_id
      LEFT JOIN LATERAL (SELECT jsonb_build_object('bucket',i.bucket,'storagePath',i.storage_path,'altText',i.alt_text) AS metadata
        FROM public.product_images i WHERE i.product_id=p.id AND i.status='published'
        ORDER BY i.display_order,i.id LIMIT 1) image ON true
      ORDER BY p.id`,
    values,
  };
}
export function createPgProductSearchRepository(pool: Pool): ProductSearchRepository {
  return {
    async find(search) {
      const terms = search.q ? await loadProductSearchTerms(pool, search.q) : undefined;
      const result = await pool.query<ProductSearchItem>(buildProductSearchQuery(search, terms));
      return result.rows;
    },
  };
}

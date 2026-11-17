import type { Pool } from 'pg';
import type { ProductSearch } from './productSearch.schema.js';
import type { ProductSearchItem, ProductSearchRepository } from './productSearch.service.js';

export function buildProductSearchQuery(search: ProductSearch) {
  const values: (string | number | boolean)[] = [];
  const conditions = ["p.status='published'", 'c.is_active', '(b.id IS NULL OR b.is_active)'];
  const parameter = (value: string | number | boolean) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (search.q) {
    const query = parameter(search.q);
    conditions.push(`(p.sku_key=catalog_internal.normalize(${query}) OR p.search_document @@ catalog_internal.search_query(${query}))`);
  }
  if (search.categoryId) conditions.push(`p.category_id=${parameter(search.categoryId)}::uuid`);
  if (search.brandId) conditions.push(`p.brand_id=${parameter(search.brandId)}::uuid`);
  if (search.featured !== undefined) conditions.push(`p.is_featured=${parameter(search.featured)}`);
  if (search.after) conditions.push(`p.id>${parameter(search.after)}`);
  const limit = parameter(search.limit + 1);
  return {
    text: `SELECT p.id,p.sku,p.name,c.name AS category,coalesce(b.name,'') AS brand,p.presentation,
      p.price_in_cents AS "priceInCents",p.currency,p.available_quantity AS "availableQuantity",
      p.available_quantity>0 AS "inStock",p.requires_prescription AS "requiresPrescription",p.is_featured AS "isFeatured",
      image.metadata AS image
      FROM public.products p JOIN public.categories c ON c.id=p.category_id
      LEFT JOIN public.brands b ON b.id=p.brand_id
      LEFT JOIN LATERAL (SELECT jsonb_build_object('bucket',i.bucket,'storagePath',i.storage_path,'altText',i.alt_text) AS metadata
        FROM public.product_images i WHERE i.product_id=p.id AND i.status='published'
        ORDER BY i.display_order,i.id LIMIT 1) image ON true
      WHERE ${conditions.join(' AND ')} ORDER BY p.id LIMIT ${limit}`,
    values,
  };
}
export function createPgProductSearchRepository(pool: Pool): ProductSearchRepository {
  return {
    async find(search) {
      const result = await pool.query<ProductSearchItem>(buildProductSearchQuery(search));
      return result.rows;
    },
  };
}

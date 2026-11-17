import type { Pool } from "pg";
import type { ProductCatalogSearch } from "./productCatalog.schema.js";
import type { ProductSearchItem } from "./productSearch.service.js";

export interface CatalogProduct extends ProductSearchItem {
  categoryId: string;
  brandId: string | null;
}
export interface CatalogPage {
  items: CatalogProduct[];
  page: number;
  totalPages: number;
  total: number;
}
export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
}

export function buildProductCatalogQuery(search: ProductCatalogSearch) {
  return {
    text: `WITH matching AS MATERIALIZED (
      SELECT p.id FROM catalog_internal.catalog_product_ids(
        catalog_internal.normalize($1),$2::uuid[],$3::boolean,$4::boolean) AS candidate(id)
      JOIN public.products p ON p.id=candidate.id
      JOIN public.categories c ON c.id=p.category_id
      LEFT JOIN public.brands b ON b.id=p.brand_id
      WHERE p.status='published' AND c.is_active AND (b.id IS NULL OR b.is_active)
    ), totals AS (SELECT count(*)::int AS total FROM matching),
    page_ids AS (SELECT id FROM matching ORDER BY id LIMIT $5 OFFSET $6),
    page_items AS (
      SELECT p.id,p.sku,p.name,c.name AS category,p.category_id AS "categoryId",
        coalesce(b.name,'') AS brand,p.brand_id AS "brandId",p.presentation,
        p.price_in_cents AS "priceInCents",p.currency,p.available_quantity AS "availableQuantity",
        p.available_quantity>0 AS "inStock",p.requires_prescription AS "requiresPrescription",
        p.is_featured AS "isFeatured",image.metadata AS image
      FROM page_ids JOIN public.products p ON p.id=page_ids.id
      JOIN public.categories c ON c.id=p.category_id
      LEFT JOIN public.brands b ON b.id=p.brand_id
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('bucket',i.bucket,'storagePath',i.storage_path,'altText',i.alt_text) AS metadata
        FROM public.product_images i WHERE i.product_id=p.id AND i.status='published'
        ORDER BY i.display_order,i.id LIMIT 1
      ) image ON true
    ) SELECT totals.total,coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id) FROM page_items item),'[]'::jsonb) AS items
    FROM totals`,
    values: [search.q ?? null,search.categoryIds ?? null,search.featured ?? null,search.inStock ?? null,
      search.pageSize,(search.page-1)*search.pageSize],
  };
}

export function createPgProductCatalogRepository(pool: Pick<Pool, "query">) {
  return {
    async categories(): Promise<CatalogCategory[]> {
      const result = await pool.query<CatalogCategory>(
        "SELECT id,name,slug FROM public.categories WHERE is_active ORDER BY display_order,name,id",
      );
      return result.rows;
    },
    async find(search: ProductCatalogSearch): Promise<CatalogPage> {
      const result = await pool.query<{ total: number; items: CatalogProduct[] }>(buildProductCatalogQuery(search));
      const row = result.rows[0]!;
      return { ...row,page: search.page,totalPages: Math.max(1,Math.ceil(row.total/search.pageSize)) };
    },
  };
}

import type { Pool } from "pg";
import { datasetSchema, productIdentity } from "./dataset.js";

export async function importCatalog(pool: Pool, input: unknown) {
  const dataset = datasetSchema.parse(input);
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(724381902)");
    const identities = dataset.products.map((product) => productIdentity(dataset.source.namespace, product.externalId).id);
    const existing = await client.query<{ id: string }>("SELECT id FROM public.products WHERE id=ANY($1::text[])", [identities]);
    const existingIds = new Set(existing.rows.map((row) => row.id));
    const categories = new Map<string, string>();
    const brands = new Map<string, string>();
    for (const product of dataset.products) {
      const identity = productIdentity(dataset.source.namespace, product.externalId);
      if (existingIds.has(identity.id)) continue;
      let categoryId = categories.get(product.category);
      if (!categoryId) {
        await client.query("INSERT INTO public.categories(name) VALUES ($1) ON CONFLICT(name_key) DO NOTHING", [product.category]);
        const result = await client.query<{ id: string }>("SELECT id FROM public.categories WHERE name_key=catalog_internal.normalize($1)", [product.category]);
        categoryId = result.rows[0]!.id;
        categories.set(product.category, categoryId);
      }
      let brandId: string | null = null;
      if (product.brand) {
        brandId = brands.get(product.brand) ?? null;
        if (!brandId) {
          await client.query("INSERT INTO public.brands(name) VALUES ($1) ON CONFLICT(name_key) DO NOTHING", [product.brand]);
          const result = await client.query<{ id: string }>("SELECT id FROM public.brands WHERE name_key=catalog_internal.normalize($1)", [product.brand]);
          brandId = result.rows[0]!.id;
          brands.set(product.brand, brandId);
        }
      }
      await client.query(`INSERT INTO public.products
        (id,sku,name,category_id,brand_id,presentation,keywords,requires_prescription,price_in_cents,available_quantity,is_featured,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,false,'draft')`,
        [identity.id,identity.sku,product.name,categoryId,brandId,product.presentation,product.keywords,product.requiresPrescription]);
      inserted++;
    }
    await client.query("COMMIT");
    return { total: dataset.products.length, inserted, skipped: dataset.products.length - inserted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

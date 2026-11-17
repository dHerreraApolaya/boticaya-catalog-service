import { z } from "zod";
import type { Pool } from "pg";

export const DEMO_DESCRIPTION = "Catálogo ficticio Botica Ya [boticaya-demo-v1]. Productos, precios, stock y requisitos de receta de demostración; sin cobros ni entregas reales.";
const text = (max: number) => z.string().trim().min(1).max(max);
export const demoCatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  datasetId: z.literal("boticaya-demo-v1"),
  products: z.array(z.strictObject({
    id: z.string().regex(/^demo-product-\d{4}$/),
    sku: z.string().regex(/^DEMO-BY-\d{4}$/),
    name: text(300).refine((value) => value.endsWith("(demo)")),
    category: text(100), brand: text(100), presentation: text(300),
    priceInCents: z.number().int().min(1).max(1000000),
    availableQuantity: z.number().int().min(0).max(1000),
    requiresPrescription: z.boolean(), isFeatured: z.boolean(),
    keywords: z.array(text(80)).max(30),
  })).min(1).max(500),
}).superRefine((dataset, context) => {
  if (new Set(dataset.products.map((p) => p.id)).size !== dataset.products.length ||
      new Set(dataset.products.map((p) => p.sku)).size !== dataset.products.length)
    context.addIssue({ code: "custom", message: "Duplicate demo identity" });
});

export async function seedDemoCatalog(pool: Pool, input: unknown) {
  const dataset = demoCatalogSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(724381902)");
    const conflicts = await client.query("SELECT 1 FROM public.products WHERE id=ANY($1::text[]) AND description<>$2 LIMIT 1",
      [dataset.products.map((p) => p.id),DEMO_DESCRIPTION]);
    if (conflicts.rowCount) throw new Error("Demo identity conflict");
    const payload = JSON.stringify(dataset.products);
    await client.query(`INSERT INTO public.categories(name)
      SELECT DISTINCT category FROM jsonb_to_recordset($1::jsonb) AS r(category text)
      ON CONFLICT(name_key) DO NOTHING`, [payload]);
    await client.query(`INSERT INTO public.brands(name)
      SELECT DISTINCT brand FROM jsonb_to_recordset($1::jsonb) AS r(brand text)
      ON CONFLICT(name_key) DO NOTHING`, [payload]);
    const inactive = await client.query(`SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS r(category text,brand text)
      JOIN public.categories c ON c.name_key=catalog_internal.normalize(r.category)
      JOIN public.brands b ON b.name_key=catalog_internal.normalize(r.brand)
      WHERE NOT c.is_active OR NOT b.is_active LIMIT 1`, [payload]);
    if (inactive.rowCount) throw new Error("Inactive demo directory");
    const result = await client.query(`INSERT INTO public.products
      (id,sku,name,category_id,brand_id,presentation,description,price_in_cents,available_quantity,
        requires_prescription,is_featured,keywords,status,currency)
      SELECT r.id,r.sku,r.name,c.id,b.id,r.presentation,$2,r."priceInCents",r."availableQuantity",
        r."requiresPrescription",r."isFeatured",r.keywords,'published','PEN'
      FROM jsonb_to_recordset($1::jsonb) AS r(id text,sku text,name text,category text,brand text,
        presentation text,"priceInCents" integer,"availableQuantity" integer,
        "requiresPrescription" boolean,"isFeatured" boolean,keywords text[])
      JOIN public.categories c ON c.name_key=catalog_internal.normalize(r.category)
      JOIN public.brands b ON b.name_key=catalog_internal.normalize(r.brand)
      ON CONFLICT(id) DO NOTHING RETURNING id`, [payload,DEMO_DESCRIPTION]);
    await client.query("COMMIT");
    return { total: dataset.products.length, inserted: result.rowCount ?? 0,
      skipped: dataset.products.length - (result.rowCount ?? 0) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

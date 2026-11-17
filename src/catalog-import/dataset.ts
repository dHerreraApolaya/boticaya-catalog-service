import { createHash } from "node:crypto";
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const httpsUrl = z.url().refine((value) => new URL(value).protocol === "https:");
const productSchema = z.strictObject({
  externalId: text(150),
  name: text(300),
  category: text(100),
  brand: text(100).nullable(),
  presentation: text(300),
  requiresPrescription: z.boolean(),
  keywords: z.array(text(80)).max(30),
});

export const datasetSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.strictObject({
    namespace: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
    country: z.literal("PE"),
    publisher: text(200),
    url: httpsUrl,
    retrievedAt: z.iso.datetime(),
    reuse: z.strictObject({
      status: z.literal("confirmed"),
      licenseOrPermission: text(300),
      evidenceUrl: httpsUrl,
      reviewedBy: text(100),
      reviewedAt: z.iso.date(),
    }),
  }),
  products: z.array(productSchema).min(1).max(5000),
}).superRefine((dataset, context) => {
  const ids = new Set<string>();
  dataset.products.forEach((product, index) => {
    if (ids.has(product.externalId))
      context.addIssue({ code: "custom", path: ["products", index, "externalId"], message: "Duplicate external ID" });
    ids.add(product.externalId);
  });
});

export type CatalogDataset = z.infer<typeof datasetSchema>;

export function productIdentity(namespace: string, externalId: string) {
  const hash = createHash("sha256").update(JSON.stringify([namespace, externalId])).digest("hex");
  return { id: `catalog-${hash}`, sku: `IMP-${hash}` };
}

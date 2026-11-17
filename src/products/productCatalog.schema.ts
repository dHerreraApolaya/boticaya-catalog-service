import { z } from "zod";

const booleanFilter = z.enum(["true", "false"]).transform((value) => value === "true");
const integerParameter = (maximum: number, fallback: string) => z.string()
  .regex(/^\d{1,4}$/).default(fallback).transform(Number)
  .pipe(z.number().int().min(1).max(maximum));

const catalogSchema = z.strictObject({
  q: z.string().trim().min(3).max(128)
    .refine((value) => value.split(/\s+/).length <= 12).optional(),
  categoryIds: z.string().max(221).transform((value) => value.split(","))
    .pipe(z.array(z.uuid()).min(1).max(6)).optional(),
  featured: booleanFilter.optional(),
  inStock: booleanFilter.optional(),
  page: integerParameter(1000, "1"),
  pageSize: integerParameter(50, "12"),
});

export type ProductCatalogSearch = z.output<typeof catalogSchema>;
export function parseProductCatalog(input: unknown) {
  return catalogSchema.safeParse(input);
}

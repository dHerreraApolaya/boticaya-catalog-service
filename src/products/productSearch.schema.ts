import { z } from "zod";

const querySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .refine((value) => value.split(/\s+/).length <= 12)
      .optional(),
    categoryId: z.uuid().optional(),
    brandId: z.uuid().optional(),
    featured: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    after: z.string().min(1).max(100).optional(),
    limit: z
      .string()
      .regex(/^\d{1,2}$/)
      .default("12")
      .transform(Number)
      .pipe(z.number().int().min(1).max(50)),
  })
  .strict();

export type ProductSearch = z.output<typeof querySchema>;
export function parseProductSearch(input: unknown) {
  return querySchema.safeParse(input);
}

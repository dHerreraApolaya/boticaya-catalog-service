import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoCatalogSchema } from "./demoCatalog.js";

const fixture = demoCatalogSchema.parse(JSON.parse(readFileSync(new URL("../../data/catalog/boticaya-demo-v1.json", import.meta.url),"utf8")));
describe("owned demo catalog snapshot", () => {
  it("contains 500 explicit demo products across six categories with available featured items", () => {
    expect(fixture.products).toHaveLength(500);
    expect(new Set(fixture.products.map((p) => p.category)).size).toBe(6);
    expect(fixture.products.filter((p) => p.isFeatured && p.availableQuantity>0)).toHaveLength(11);
    expect(fixture.products.filter((p) => p.availableQuantity>0)).toHaveLength(455);
  });
  it("rejects real-looking identities, missing demo labels and invalid commercial values", () => {
    for (const patch of [{ id: "real-1" },{ sku: "real-1" },{ name: "Unlabelled" },{ priceInCents: 0 },{ availableQuantity: -1 }]) {
      expect(demoCatalogSchema.safeParse({ ...fixture,products: [{ ...fixture.products[0],...patch }] }).success).toBe(false);
    }
  });
  it("rejects duplicate IDs or SKUs before any database connection", () => {
    expect(demoCatalogSchema.safeParse({ ...fixture, products: [fixture.products[0],fixture.products[0]] }).success).toBe(false);
    expect(demoCatalogSchema.safeParse({ ...fixture, products: [fixture.products[0],{ ...fixture.products[1],sku: fixture.products[0]!.sku }] }).success).toBe(false);
  });
});

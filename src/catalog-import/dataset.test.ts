import { describe, expect, it } from "vitest";
import { datasetSchema, productIdentity } from "./dataset.js";

export const fixture = {
  schemaVersion: 1,
  source: {
    namespace: "fictional-test",
    country: "PE",
    publisher: "Fictional test publisher",
    url: "https://example.com/catalog",
    retrievedAt: "2026-11-17T12:00:00Z",
    reuse: {
      status: "confirmed",
      licenseOrPermission: "Fictional test permission; not an official dataset",
      evidenceUrl: "https://example.com/permission",
      reviewedBy: "Test fixture",
      reviewedAt: "2026-11-17",
    },
  },
  products: [{ externalId: "test-1", name: "Producto ficticio", category: "Pruebas", brand: null,
    presentation: "Caja de prueba", requiresPrescription: true, keywords: ["ficticio"] }],
};

describe("catalog dataset", () => {
  it("accepts curated Peruvian records with explicit reuse evidence", () => {
    expect(datasetSchema.parse(fixture).products).toHaveLength(1);
  });
  it("requires confirmed reuse evidence and country PE", () => {
    expect(datasetSchema.safeParse({ ...fixture, source: { ...fixture.source, country: "US" } }).success).toBe(false);
    expect(datasetSchema.safeParse({ ...fixture, source: { ...fixture.source, reuse: undefined } }).success).toBe(false);
    expect(datasetSchema.safeParse({ ...fixture, source: { ...fixture.source, url: "http://example.com" } }).success).toBe(false);
  });
  it("rejects duplicate presentation IDs and unknown prescription requirements", () => {
    expect(datasetSchema.safeParse({ ...fixture, products: [fixture.products[0], fixture.products[0]] }).success).toBe(false);
    expect(datasetSchema.safeParse({ ...fixture, products: [{ ...fixture.products[0], requiresPrescription: null }] }).success).toBe(false);
  });
  it("rejects unsupported fields rather than importing commercial data", () => {
    expect(datasetSchema.safeParse({ ...fixture, products: [{ ...fixture.products[0], price: 10 }] }).success).toBe(false);
  });
  it("keeps identities stable and separates sources", () => {
    expect(productIdentity("source-a", "123")).toEqual(productIdentity("source-a", "123"));
    expect(productIdentity("source-a", "123")).not.toEqual(productIdentity("source-b", "123"));
  });
});

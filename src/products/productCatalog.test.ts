import { describe, expect, it } from "vitest";
import { parseProductCatalog } from "./productCatalog.schema.js";
import { buildProductCatalogQuery } from "./productCatalog.repository.js";

describe("numbered product catalog", () => {
  it("uses bounded pagination defaults", () => {
    expect(parseProductCatalog({})).toMatchObject({ success: true,data: { page: 1,pageSize: 12 } });
    expect(buildProductCatalogQuery({ page: 2,pageSize: 12 }).values).toEqual([null,null,null,null,12,12]);
  });
  it.each([
    { q: "ab" },{ q: "a".repeat(129) },{ q: Array(13).fill("abc").join(" ") },
    { page: "1001" },{ page: "0" },{ page: "1.2" },{ pageSize: "51" },{ pageSize: "0" },
    { categoryIds: "bad" },{ categoryIds: Array(7).fill("082e7954-cde5-4e76-a0c2-c2a091d008d9").join(",") },
    { categoryIds: ["082e7954-cde5-4e76-a0c2-c2a091d008d9"] },{ featured: "yes" },{ inStock: "1" },{ unknown: "x" },
  ])("rejects invalid or excessive query %o", (query) => {
    expect(parseProductCatalog(query).success).toBe(false);
  });
  it("parses category OR filters and binds all client values", () => {
    const id = "082e7954-cde5-4e76-a0c2-c2a091d008d9";
    const q = "x'); DROP TABLE products; --";
    const result = parseProductCatalog({ q,categoryIds: id,featured: "false",inStock: "true",page: "2",pageSize: "5" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected parsed fixture");
    const query = buildProductCatalogQuery(result.data);
    expect(query.text).not.toContain(q);
    expect(query.values).toEqual([q,[id],false,true,5,5]);
  });
});

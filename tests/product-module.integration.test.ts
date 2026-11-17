import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  buildProductSearchQuery,
  loadProductSearchTerms,
} from "../src/products/productSearch.repository.js";

const url = process.env.BOTICAYA_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Use an isolated test database ending in _test");
const database = `boticaya_products_${randomUUID().replaceAll("-", "")}_test`;
const admin = new Pool({ connectionString: url });
let pool: Pool;
let server: Server;
let baseUrl: string;
let created = false;
let readerCreated = false;
let editorCreated = false;
let categoryId: string;
let brandId: string;

beforeAll(async () => {
  const roles = await admin.query(
    "SELECT 1 FROM pg_roles WHERE rolname IN ('boticaya_catalog_app','boticaya_catalog_editor')",
  );
  if (roles.rowCount)
    throw new Error(
      "Use an isolated PostgreSQL instance without catalog roles",
    );
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const connection = new URL(url!);
  connection.pathname = `/${database}`;
  pool = new Pool({ connectionString: connection.href });
  const initial = await readFile(
    new URL("../sql/migrations/002-catalog-readonly.sql", import.meta.url),
    "utf8",
  );
  await pool.query(initial);
  readerCreated = true;
  await pool.query(
    "INSERT INTO public.products VALUES ('legacy-1','LEG-1','Legacy item','Medicamentos','Legacy brand','Caja',100,4,false,true)",
  );
  const migration = await readFile(
    new URL("../sql/migrations/003-product-module.sql", import.meta.url),
    "utf8",
  );
  await pool.query(migration);
  editorCreated = true;
  categoryId = (await pool.query("SELECT id FROM public.categories LIMIT 1"))
    .rows[0].id;
  brandId = (await pool.query("SELECT id FROM public.brands LIMIT 1")).rows[0]
    .id;
  await pool.query(
    `INSERT INTO public.products(id,sku,name,category_id,brand_id,presentation,price_in_cents,available_quantity,keywords)
    SELECT 'volume-'||lpad(i::text,6,'0'),'VOL-'||i,'Producto ficticio '||i,$1,$2,'Caja',100,5,
      CASE WHEN i=12345 THEN ARRAY['únicobuscable','dolor leve'] ELSE ARRAY['general'] END
    FROM generate_series(1,20000) i`,
    [categoryId, brandId],
  );
  await pool.query(
    `INSERT INTO public.products(id,sku,name,category_id,presentation,price_in_cents,status,keywords)
    VALUES ('draft-1','DRAFT-1','Oculto',$1,'Caja',100,'draft',ARRAY['únicobuscable'])`,
    [categoryId],
  );
  await pool.query("ANALYZE public.products");
  server = createApp(pool).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await pool?.end();
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  if (editorCreated) await admin.query("DROP ROLE boticaya_catalog_editor");
  if (readerCreated) await admin.query("DROP ROLE boticaya_catalog_app");
  await admin.end();
});
async function asRole(
  role: "boticaya_catalog_app" | "boticaya_catalog_editor",
  run: (client: PoolClient) => Promise<void>,
) {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    await run(client);
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}
function planIndexes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(planIndexes);
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record["Index Name"] === "string" ? [record["Index Name"]] : []),
    ...Object.values(record).flatMap(planIndexes),
  ];
}

async function queryFor(search: Parameters<typeof buildProductSearchQuery>[0]) {
  return buildProductSearchQuery(
    search,
    search.q ? await loadProductSearchTerms(pool, search.q) : undefined,
  );
}

describe("normalized product module", () => {
  it("preserves existing identifiers, labels and stock", async () => {
    const row = (
      await pool.query(
        "SELECT id,category,brand,available_quantity,category_id,brand_id FROM public.products WHERE id='legacy-1'",
      )
    ).rows[0];
    expect(row).toMatchObject({
      id: "legacy-1",
      category: "Medicamentos",
      brand: "Legacy brand",
      available_quantity: 4,
      category_id: categoryId,
      brand_id: brandId,
    });
  });
  it("supports accent-insensitive keywords and safe prefix search without leaking drafts", async () => {
    await asRole("boticaya_catalog_app", async (client) => {
      const result = await client.query(
        await queryFor({ q: "UNICOBUSC", limit: 12 }),
      );
      expect(result.rows.map((row) => row.id)).toEqual(["volume-012345"]);
      const shortSku = await client.query(
        await queryFor({ q: "VOL-12345", limit: 12 }),
      );
      expect(shortSku.rows.some((row) => row.id === "volume-012345")).toBe(
        true,
      );
    });
  });
  it("keeps malicious query and cursor values as data", async () => {
    const query = new URLSearchParams({
      q: "xyz'); DROP TABLE public.products; --",
      after: "' OR 1=1 --",
    });
    const response = await fetch(`${baseUrl}/api/products/search?${query}`);
    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([]);
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM public.products"))
        .rows[0].count,
    ).toBe(20002);
  });
  it("restricts the elevated candidate helper to published catalog data and honors all filters", async () => {
    await asRole("boticaya_catalog_app", async (client) => {
      const terms = await loadProductSearchTerms(pool, "unicobuscable");
      const result = await client.query(
        "SELECT id FROM catalog_internal.search_product_ids($1,$2::tsquery,$3,$4,$5,$6) AS ids(id)",
        [
          terms.skuKey,
          terms.tsquery,
          categoryId,
          brandId,
          false,
          "volume-010000",
        ],
      );
      expect(result.rows).toEqual([{ id: "volume-012345" }]);
      expect(
        (
          await client.query(
            "SELECT id FROM catalog_internal.search_product_ids($1,$2::tsquery,$3,$4,$5,$6) AS ids(id)",
            [terms.skuKey, terms.tsquery, categoryId, brandId, true, null],
          )
        ).rows,
      ).toEqual([]);
    });
    expect(
      (await fetch(`${baseUrl}/api/products/search?limit=1&q=NORESULT`)).status,
    ).toBe(200);
  });

  it("rejects oversized pages, short queries and unknown sorting parameters", async () => {
    for (const query of [
      "limit=99",
      "q=ab",
      "sort=name%3BDROP",
      "featured=invalid",
      "categoryId=invalid",
    ]) {
      expect(
        (await fetch(`${baseUrl}/api/products/search?${query}`)).status,
      ).toBe(400);
    }
  });
  it("paginates without duplicate rows and filters in SQL", async () => {
    const first = await (
      await fetch(
        `${baseUrl}/api/products/search?limit=2&categoryId=${categoryId}&brandId=${brandId}&featured=false`,
      )
    ).json();
    const second = await (
      await fetch(
        `${baseUrl}/api/products/search?limit=2&after=${first.nextCursor}`,
      )
    ).json();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(4);
  });
  it("allows editor registration, normalizes keywords and enforces optimistic versions", async () => {
    await asRole("boticaya_catalog_editor", async (client) => {
      const result = await client.query(
        `INSERT INTO public.products(sku,name,category_id,presentation,price_in_cents,keywords,status)
        VALUES ($1,$2,$3,$4,$5,$6,'draft') RETURNING id,version,keywords,category`,
        [
          "NEW-1",
          "  Nuevo producto  ",
          categoryId,
          "Caja",
          100,
          ["ÁLIAS", "alias"],
        ],
      );
      expect(result.rows[0]).toMatchObject({
        version: 1,
        keywords: ["alias"],
        category: "Medicamentos",
      });
      const id = result.rows[0].id;
      expect(
        (
          await client.query(
            "UPDATE public.products SET name=$1 WHERE id=$2 AND version=$3",
            ["Editado", id, 1],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await client.query(
            "UPDATE public.products SET name=$1 WHERE id=$2 AND version=$3",
            ["Obsoleto", id, 1],
          )
        ).rowCount,
      ).toBe(0);
      await expect(
        client.query("DELETE FROM public.products WHERE id=$1", [id]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("enforces unique category names, SKUs and bounded keywords", async () => {
    await expect(
      pool.query("INSERT INTO public.categories(name) VALUES ('Médicamentos')"),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query(
        "UPDATE public.products SET sku='leg-1' WHERE id='volume-000001'",
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query("UPDATE public.products SET keywords=$1 WHERE id='legacy-1'", [
        Array(31).fill("alias"),
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "UPDATE public.products SET keywords=ARRAY[''] WHERE id='legacy-1'",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("refreshes searchable labels after a brand rename and hides inactive brands", async () => {
    await pool.query(
      "UPDATE public.brands SET name='Marca renombrada' WHERE id=$1",
      [brandId],
    );
    const result = await pool.query(
      await queryFor({ q: "renombrada", limit: 1 }),
    );
    expect(result.rows).toHaveLength(2);
    await pool.query("UPDATE public.brands SET is_active=false WHERE id=$1", [
      brandId,
    ]);
    await asRole("boticaya_catalog_app", async (client) => {
      expect(
        (await client.query(await queryFor({ q: "renombrada", limit: 1 })))
          .rows,
      ).toEqual([]);
    });
    await pool.query("UPDATE public.brands SET is_active=true WHERE id=$1", [
      brandId,
    ]);
  });
  it("publishes only validated image metadata and chooses a single ordered image", async () => {
    await pool.query(`INSERT INTO public.product_images(product_id,bucket,storage_path,mime_type,byte_size,status)
      VALUES ('legacy-1','product-image-uploads','products/legacy/pending.png','image/png',100,'pending')`);
    await expect(
      pool.query(
        "UPDATE public.product_images SET status='published' WHERE product_id='legacy-1'",
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query(`INSERT INTO public.product_images(product_id,bucket,storage_path,mime_type,byte_size,width,height,status,alt_text)
      VALUES ('legacy-1','product-images','products/legacy/card.webp','image/webp',100,200,200,'published','Producto')`);
    await asRole("boticaya_catalog_app", async (client) => {
      expect(
        (await client.query("SELECT id FROM public.product_images")).rows,
      ).toHaveLength(1);
      const result = await client.query(
        await queryFor({ q: "LEG-1", limit: 12 }),
      );
      expect(result.rows[0].image).toMatchObject({
        bucket: "product-images",
        storagePath: "products/legacy/card.webp",
      });
      await expect(
        client.query("UPDATE public.products SET name='forbidden'"),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("measures selective search plans without disabling sequential scans", async () => {
    const query = await queryFor({ q: "unicobuscable", limit: 12 });
    const privileged = await pool.query({
      text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
      values: query.values,
    });
    await asRole("boticaya_catalog_app", async (client) => {
      const restricted = await client.query({
        text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
        values: query.values,
      });
      console.info(
        JSON.stringify({
          catalogSearchPlan: {
            privilegedIndexes: planIndexes(privileged.rows[0]["QUERY PLAN"]),
            restrictedIndexes: planIndexes(restricted.rows[0]["QUERY PLAN"]),
          },
        }),
      );
      const body = (
        await pool.query(
          "SELECT prosrc FROM pg_proc WHERE oid='catalog_internal.search_product_ids(text,tsquery,uuid,uuid,boolean,text)'::regprocedure",
        )
      ).rows[0].prosrc as string;
      const argumentsList = [
        "normalized_sku",
        "search_terms",
        "selected_category",
        "selected_brand",
        "featured_only",
        "after_id",
      ];
      let innerSql = body;
      argumentsList.forEach((name, index) => {
        innerSql = innerSql.replace(
          new RegExp(`\\b${name}\\b`, "g"),
          `($${index + 1}::${['text', 'tsquery', 'uuid', 'uuid', 'boolean', 'text'][index]})`,
        );
      });
      const terms = await loadProductSearchTerms(pool, "unicobuscable");
      const innerPlan = await pool.query({
        text: `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${innerSql}`,
        values: [terms.skuKey, terms.tsquery, null, null, null, null],
      });
      console.info(
        JSON.stringify({
          catalogInternalSearchPlan: {
            indexes: planIndexes(innerPlan.rows[0]["QUERY PLAN"]),
            executionMs: innerPlan.rows[0]["QUERY PLAN"][0]["Execution Time"],
            restrictedExecutionMs:
              restricted.rows[0]["QUERY PLAN"][0]["Execution Time"],
          },
        }),
      );
      expect(planIndexes(innerPlan.rows[0]["QUERY PLAN"])).toContain(
        "products_search_gin",
      );
      expect(
        restricted.rows[0]["QUERY PLAN"][0]["Execution Time"],
      ).toBeGreaterThanOrEqual(0);
    });
  });
});

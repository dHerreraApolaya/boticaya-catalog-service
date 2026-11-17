import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { verifyCatalogReader } from "../src/database/readerCheck.js";

const url = process.env.BOTICAYA_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Use an isolated test database ending in _test");
const suffix = randomUUID().replaceAll("-", "");
const database = `catalog_reader_${suffix}_test`;
const reader = `reader_${suffix}`;
const admin = new Pool({ connectionString: url });
let pool: Pool;
let created = false;
let readerCreated = false;
let appCreated = false;
let editorCreated = false;

beforeAll(async () => {
  const existing = await admin.query(
    "SELECT 1 FROM pg_roles WHERE rolname IN ('boticaya_catalog_app','boticaya_catalog_editor')",
  );
  if (existing.rowCount) throw new Error("Use an isolated PostgreSQL instance without catalog roles");
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const connection = new URL(url!);
  connection.pathname = `/${database}`;
  pool = new Pool({ connectionString: connection.href });
  await pool.query(await readFile(new URL("../sql/migrations/002-catalog-readonly.sql", import.meta.url), "utf8"));
  appCreated = true;
  await pool.query(await readFile(new URL("../sql/migrations/003-product-module.sql", import.meta.url), "utf8"));
  editorCreated = true;
  await pool.query(`CREATE ROLE "${reader}" NOLOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
  readerCreated = true;
  await pool.query(`GRANT boticaya_catalog_app TO "${reader}"`);
  await pool.query("CREATE TABLE public.users(id TEXT PRIMARY KEY, private_note TEXT)");
}, 30000);

afterAll(async () => {
  await pool?.end();
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  if (readerCreated) await admin.query(`DROP ROLE "${reader}"`);
  if (editorCreated) await admin.query("DROP ROLE boticaya_catalog_editor");
  if (appCreated) await admin.query("DROP ROLE boticaya_catalog_app");
  await admin.end();
});

async function checkReader() {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE "${reader}"`);
    await verifyCatalogReader({
      async connect() {
        return {
          query: client.query.bind(client),
          release() {},
        };
      },
    }, { requireTls: false });
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}

it("accepts an inherited catalog-only reader with forced RLS", async () => {
  await expect(checkReader()).resolves.toBeUndefined();
});

it("rejects the administrative database identity", async () => {
  await expect(verifyCatalogReader(pool, { requireTls: false })).rejects.toThrow("Catalog reader verification failed");
});

it("rejects an otherwise valid reader with write permission", async () => {
  await pool.query(`GRANT INSERT ON public.products TO "${reader}"`);
  try {
    await expect(checkReader()).rejects.toThrow("Catalog reader verification failed");
  } finally {
    await pool.query(`REVOKE INSERT ON public.products FROM "${reader}"`);
  }
});

it("rejects column-level identity read access without querying identity rows", async () => {
  await pool.query(`GRANT SELECT(private_note) ON public.users TO "${reader}"`);
  try {
    await expect(checkReader()).rejects.toThrow("Catalog reader verification failed");
  } finally {
    await pool.query(`REVOKE SELECT(private_note) ON public.users FROM "${reader}"`);
  }
});

it("rejects a role that owns a catalog table", async () => {
  await pool.query(`ALTER TABLE public.products OWNER TO "${reader}"`);
  try {
    await expect(checkReader()).rejects.toThrow("Catalog reader verification failed");
  } finally {
    await pool.query("ALTER TABLE public.products OWNER TO CURRENT_USER");
  }
});

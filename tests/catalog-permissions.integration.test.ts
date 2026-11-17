import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.BOTICAYA_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    "Set BOTICAYA_TEST_DATABASE_URL to a disposable database ending in _test",
  );
}
const database = `boticaya_catalog_${randomUUID().replaceAll("-", "")}_test`;
const admin = new Pool({ connectionString: databaseUrl });
let pool: Pool;
let created = false;
let roleCreated = false;
const createdApiRoles: string[] = [];
const apiRoles = ["anon", "authenticated", "service_role"];
const migration = await readFile(
  new URL("../sql/migrations/002-catalog-readonly.sql", import.meta.url),
  "utf8",
);

beforeAll(async () => {
  const existing = await admin.query(
    "SELECT 1 FROM pg_roles WHERE rolname='boticaya_catalog_app'",
  );
  if (existing.rowCount)
    throw new Error(
      "Catalog role already exists; use an isolated PostgreSQL instance",
    );
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const url = new URL(databaseUrl!);
  url.pathname = `/${database}`;
  pool = new Pool({ connectionString: url.href });
  for (const role of apiRoles) {
    const exists = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (!exists.rowCount) {
      await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
      createdApiRoles.push(role);
    }
  }
  await pool.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role",
  );
  await pool.query("CREATE TABLE public.private_customer_fixture (id integer)");
  await pool.query("INSERT INTO public.private_customer_fixture VALUES (1)");
  await pool.query(migration);
  roleCreated = true;
  await pool.query(`INSERT INTO public.products VALUES
    ('fixture-1', 'FIX-1', 'Fictional item', 'Medicamentos', 'Fixture', 'Unidad', 100, 5, false, true)`);
});

afterAll(async () => {
  await pool?.end();
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  if (roleCreated) await admin.query("DROP ROLE boticaya_catalog_app");
  for (const role of createdApiRoles) await admin.query(`DROP ROLE "${role}"`);
  await admin.end();
});

async function asCatalog(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("SET ROLE boticaya_catalog_app");
    await run(client);
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}

describe("catalog least-privilege migration", () => {
  it("permits catalog reads under RLS", async () => {
    await asCatalog(async (client) => {
      const result = await client.query(
        "SELECT sku, available_quantity FROM public.products",
      );
      expect(result.rows).toEqual([{ sku: "FIX-1", available_quantity: 5 }]);
    });
    const result = await pool.query(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='public.products'::regclass",
    );
    expect(result.rows[0]).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
  });

  it.each([
    "INSERT INTO public.products SELECT * FROM public.products LIMIT 0",
    "UPDATE public.products SET available_quantity=0",
    "DELETE FROM public.products",
    "TRUNCATE public.products",
    "SELECT * FROM public.private_customer_fixture",
    "CREATE TABLE public.forbidden_fixture (id integer)",
    "DROP TABLE public.products",
  ])("denies unauthorized operation: %s", async (sql) => {
    await asCatalog(async (client) => {
      await expect(client.query(sql)).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("revokes inherited table defaults from Supabase HTTP API roles and PUBLIC", async () => {
    for (const role of apiRoles) {
      const result = await pool.query(
        "SELECT has_table_privilege($1, 'public.products', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",
        [role],
      );
      expect(result.rows[0].allowed).toBe(false);
    }
    const result = await pool.query(
      "SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.oid='public.products'::regclass AND a.grantee=0",
    );
    expect(result.rowCount).toBe(0);
  });

  it("creates a non-login role without administrative privileges or membership", async () => {
    const result = await pool.query(
      "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname='boticaya_catalog_app'",
    );
    expect(Object.values(result.rows[0])).toEqual(Array(7).fill(false));
    const membership = await pool.query(
      "SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='boticaya_catalog_app')",
    );
    expect(membership.rowCount).toBe(0);
  });

  it("fails safely on reapplication without resetting catalog data", async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(migration)).rejects.toMatchObject({
        code: "42710",
      });
      await client.query("ROLLBACK");
      const result = await client.query(
        "SELECT count(*)::int AS count FROM public.products",
      );
      expect(result.rows[0].count).toBe(1);
    } finally {
      client.release();
    }
  });

  it("enforces nonnegative stock and prices", async () => {
    await expect(
      pool.query("UPDATE public.products SET available_quantity=-1"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("UPDATE public.products SET price_in_cents=-1"),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

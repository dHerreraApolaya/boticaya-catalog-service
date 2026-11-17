export interface ReaderProbeClient {
  query(sql: string): Promise<{ rows: { allowed?: boolean }[] }>;
  release(): void;
  connection?: {
    stream?: unknown;
  };
}

export interface ReaderProbePool {
  connect(): Promise<ReaderProbeClient>;
}

export const READER_PERMISSION_QUERY = `
WITH catalog_tables AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND c.relname IN ('products','categories','brands','product_images')
), identity_tables AS (
  SELECT c.oid FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    AND c.relname IN ('users','sessions','roles','user_roles','consents','schema_migrations')
)
SELECT
  (SELECT NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
     FROM pg_catalog.pg_roles WHERE rolname=current_user)
  AND (SELECT count(*)=4 FROM catalog_tables)
  AND NOT EXISTS (
    SELECT 1 FROM catalog_tables c
    WHERE pg_catalog.pg_has_role(current_user,c.relowner,'MEMBER')
       OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
       OR NOT pg_catalog.has_table_privilege(current_user,c.oid,'SELECT')
       OR pg_catalog.has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR pg_catalog.has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES')
  )
  AND NOT EXISTS (
    SELECT 1 FROM identity_tables c
    WHERE pg_catalog.has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR pg_catalog.has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
  )
  AND NOT pg_catalog.has_schema_privilege(current_user,'public','CREATE')
  AND NOT pg_catalog.has_schema_privilege(current_user,'catalog_internal','CREATE')
  AND NOT pg_catalog.has_schema_privilege(current_user,'extensions','CREATE')
  AS allowed
`;

export async function verifyCatalogReader(
  pool: ReaderProbePool,
  options: { requireTls: boolean } = { requireTls: true },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='5s'");
    const stream = client.connection?.stream;
    if (
      options.requireTls &&
      (typeof stream !== "object" || stream === null ||
        !("encrypted" in stream) || stream.encrypted !== true ||
        !("authorized" in stream) || stream.authorized !== true)
    ) {
      throw new Error("Catalog reader verification failed");
    }
    const result = await client.query(READER_PERMISSION_QUERY);
    if (result.rows.length !== 1 || result.rows[0]?.allowed !== true) {
      throw new Error("Catalog reader verification failed");
    }
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}

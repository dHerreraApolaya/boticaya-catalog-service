# Supabase development connection

## Current status

Connection support is prepared. No Supabase project, credentials or database access has been supplied. No remote connection, SQL migration, role creation or production change has been performed.

## Provisioning boundary

Create or select a dedicated development project under an account you control. Store the database password in a password manager. Obtain PostgreSQL connection parameters from the project Connect panel; an anon/publishable or service-role API key is not a PostgreSQL password. Project creation, billing, database roles and schema changes must be handled explicitly, not as side effects of diagnostics.

## Local environment

Copy `.env.example` to ignored `.env`. Set BOTICAYA_DB_HOST, BOTICAYA_DB_PORT, BOTICAYA_DB_NAME, BOTICAYA_DB_USER and BOTICAYA_DB_PASSWORD from the project's connection settings. Use BOTICAYA_DB_SSL=true for all remote hosts. Direct connections suit a persistent Express server when IPv6 is available; use the session pooler connection parameters for an IPv4-only environment. Do not guess the host or username. Keep BOTICAYA_ORDERS_ENABLED=false.

Download the project's CA certificate from its dashboard over HTTPS, store it outside Git and set BOTICAYA_DB_CA_FILE to its absolute path when needed. Omit this variable entirely when relying on the system trust roots; an empty value is invalid. Certificate and hostname verification remain enabled. Never set rejectUnauthorized=false or NODE_TLS_REJECT_UNAUTHORIZED=0 to resolve a TLS failure.

Use a dedicated catalog role with CONNECT, schema USAGE and SELECT on products. Do not use the postgres administrator or migration role as the permanent API identity. Confirm the session-pooler username for that role in Supabase. Review RLS and grants for the role used by the API; Supabase HTTP API policies do not replace PostgreSQL role permissions. Creating roles or changing policies is a separately reviewed operation.

## Read-only verification

Run `pnpm install --frozen-lockfile` and `pnpm verify:database`. The command checks connection, catalog columns and SELECT permission in a read-only transaction with LIMIT 0 and rolls back. It logs neither configuration values nor database errors. It does not seed products, alter tables, inspect personal data or enable orders. Success does not establish row visibility under RLS or readiness of the order workflow.

If products does not exist, stop and review `sql/catalogo-prueba.sql` against the current schema before applying any migration. Do not run `pnpm migrate`, `pnpm verify:orders` or integration tests against this remote environment as a connection check. Integration coverage belongs on a disposable PostgreSQL database ending in `_test`.

## Next integration stage

After configuration and read-only verification, confirm the catalog contract and independently review schema, least-privilege grants and RLS. Connect the frontend through Express in a separate change. Supabase credentials and CA paths never belong in frontend VITE variables or public logs.

Sources: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/platform/ssl-enforcement

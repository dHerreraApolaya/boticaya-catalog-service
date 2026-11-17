# Catalog runtime reader

## Status

This document is a provisioning proposal. No login, password, grants or live role changes are performed by `verify:catalog-reader`. Confirm the target development project and obtain explicit authorization before provisioning or rotating credentials. Do not paste passwords or connection strings into chat.

The runtime API must use a dedicated catalog reader. Administrative diagnostic credentials must not remain the API identity: administrative access can bypass RLS and reveal drafts through legacy endpoints. Imports and migrations use separate maintenance identities and never run at application startup.

## Proposed provisioning by an authorized DBA

Keep the existing `boticaya_catalog_app` group NOLOGIN. Create a dedicated login wrapper with no administrative attributes, grant membership in the reader group and no other application/admin roles, and retain forced RLS on the catalog tables. Do not grant ownership, schema CREATE, catalog writes, identity access or BYPASSRLS.

The following is a review template, not an executed migration. Verify the role name is unused and catalog migrations 002/003 are present before executing against an explicitly approved development target:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
CREATE ROLE boticaya_catalog_reader_dev
  NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;
GRANT boticaya_catalog_app TO boticaya_catalog_reader_dev;
ALTER ROLE boticaya_catalog_reader_dev SET default_transaction_read_only = on;
ALTER ROLE boticaya_catalog_reader_dev SET statement_timeout = '10s';
ALTER ROLE boticaya_catalog_reader_dev SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE boticaya_catalog_reader_dev SET search_path = pg_catalog;
COMMIT;
```

On PostgreSQL 16+, consider explicit membership options `WITH INHERIT TRUE, SET FALSE, ADMIN FALSE` after checking the server version and managed grantor permissions. Group role configuration settings are not inherited; set defaults on the wrapper itself. Read-only defaults are a guard, not an authorization mechanism: grants and RLS enforce the boundary.

A human assigns a strong password using a password manager and secure local password prompt, such as `psql`'s `\password boticaya_catalog_reader_dev` over verified TLS. Never commit a password-bearing SQL statement or put credentials in command-line arguments. Keep LOGIN disabled until credentials are safely stored, then enable LOGIN as a separate explicit provisioning step. Do not grant an administrator membership merely to simplify a SET ROLE test.

Supabase shared session pooler uses `ROLE.PROJECT_REF` as username and the custom role's own password. Copy the host from the project's Connect panel; do not derive the host from region. Retain remote TLS certificate and hostname verification.

## Separate configuration

- Runtime `.env` contains only the reader connection and keeps orders disabled.
- A separate ignored `.env.import` may contain a catalog writer connection for deliberate imports. Confirm it is ignored before creating it; restrict local file permissions to 0600. Do not load reader and writer files in the same process or rely on environment precedence to select privileges.
- Migrations use a separately authorized administrative environment. Never expose these values through frontend `VITE_` variables.

The importer can be launched explicitly with a selected writer file after an authorized dataset exists:

```sh
node --env-file=.env.import scripts/import-catalog.mjs --file /absolute/path/approved-catalog.json
```

This remains validation-only without the existing apply, target and checksum arguments. No official dataset is currently bundled. Only confirmed reusable Peruvian products and actual price/stock supplied by the botica may proceed to curation/publication. Imported drafts are not automatically published.

## Read-only verification

After separately authorized provisioning and local reader configuration:

```sh
pnpm verify:catalog-reader
```

The verifier opens a read-only transaction, checks metadata, rolls back and releases the connection. It does not create roles, change grants, inspect identity/product row contents, import products or publish them. Remote connections require the existing TLS configuration; when TLS is enabled, the actual PostgreSQL client stream must be encrypted with an authorized certificate. It prints neither usernames, configuration values nor internal database errors.

It fails closed if any of these conditions holds:

- Administrative role attributes, including superuser, BYPASSRLS, database/role creation or replication.
- Missing catalog tables, table ownership directly or through role membership, absent SELECT, any effective table/column write permission or schema CREATE in catalog schemas.
- RLS not enabled and forced on every catalog table.
- Any effective read/write permission, including column grants, on the known public identity tables when present: users, sessions, roles, user_roles, consents, schema_migrations.

Passing this check establishes a narrow metadata baseline, not a complete security audit. It does not audit all other schemas, unknown identity tables, callable SECURITY DEFINER functions, unrelated grants or data publication policies. A DBA must review those separately. It also does not prove that matching products exist or that the frontend is connected; complete those checks with reviewed data and the runtime reader identity. Empty development responses are valid and must not be replaced with silent mock data.

Write-denial, identity access and ownership scenarios are tested only in disposable PostgreSQL databases ending in `_test`. Do not run integration tests against Supabase.

## Sources

- [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles)
- [Supabase managed role limitations](https://supabase.com/docs/guides/database/postgres/roles-superuser)
- [Supabase connection modes and custom-role pooler usernames](https://supabase.com/docs/guides/database/connecting-to-postgres)

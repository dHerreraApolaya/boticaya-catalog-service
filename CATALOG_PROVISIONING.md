# Catalog provisioning review

## Scope

`sql/migrations/002-catalog-readonly.sql` creates only public.products and boticaya_catalog_app. Existing users, sessions, roles, consents and related tables are not altered. No catalog data is inserted. This is a one-time transactional migration: an existing table or role aborts it instead of silently accepting an unknown schema or privileges.

The role starts NOLOGIN without a password, administrative capabilities, inherited memberships or RLS bypass. It receives database CONNECT, public schema USAGE and SELECT only on products. RLS is enabled and forced, with a SELECT policy exclusively for this role. PUBLIC and existing Supabase API roles receive no privileges on the new table. Schema privileges are not changed globally; indirect CREATE access causes a rollback for review.

## Preconditions and application

Review and merge the PR before applying it. Confirm the target is botica-ya-dev and that the exact reviewed migration is selected. Apply using a controlled administrative connection in a separate authorized step. `pnpm migrate` is the old local-orders migration and MUST NOT be used for this catalog setup. The seed file is a test fixture, not the provisioning migration.

No live migration or grants have been applied by this PR. Before the API is started, review effective permissions on existing private tables, callable SECURITY DEFINER functions and PUBLIC grants: NOINHERIT does not remove PUBLIC privileges. Abort activation if the role can access unrelated data or privileged functions.

Provision a dedicated password and enable LOGIN separately after permission review. Keep the password in a password manager and local ignored environment only; never paste it into chat, SQL history or Git. A login credential is deliberately not generated in the migration. For session pooling, use the dedicated role and the verified project suffix, not the postgres administrative identity. Retain TLS certificate verification and keep orders disabled.

After activation, run the read-only connection diagnostic from the secure-connection PR and validate the empty catalog response using the restricted role. Product seeding is a separate reviewed change. The current verify:catalog fixture command expects a specific fake product and must not be used to assess an empty real catalog.

## Verification and recovery

Integration tests create and destroy a dedicated disposable database ending in _test on an isolated PostgreSQL server. They verify reads, RLS, denial of writes/DDL/private-table access, role attributes, constraints and safe reapplication. They never target Supabase.

Before commit, any migration failure rolls back role, table, grants and policy together. After commit, do not automatically drop a table or role: confirm usage and preserve data before a separately reviewed rollback. Credential rotation and revocation are separate operations.

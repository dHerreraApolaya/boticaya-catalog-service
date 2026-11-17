# Owned development demo catalog

The owner explicitly authorized using the project's 500 fictional products with fictional prices and stock on 2026-11-17, superseding the earlier real-commercial-values-only restriction **for this development demonstration**. No DIGEMID dataset or third-party image is used. Official-source reuse permission remains unverified and is not asserted by this seed.

`data/catalog/boticaya-demo-v1.json` is a versioned snapshot derived from the existing frontend fictional fixture. It contains 500 unique demo IDs/SKUs, six categories, five fictional brands, 455 stocked products and 11 stocked featured products. Names end with `(demo)` and descriptions carry a fixed dataset marker. Prescription flags are fictional workflow inputs, not verified clinical or dispensing guidance. Prices are synthetic PEN amounts, not researched market prices.

The frontend reads these rows through the actual API and restricted Supabase reader. It does not substitute a client-side mock catalog. Keep the demo notice visible before purchase and the existing no-charge/no-delivery confirmation at the end. Orders remain disabled on the API; checkout continues to use its mock adapters.

## Validate without database access

```sh
pnpm build
pnpm seed:demo-catalog
```

Default mode validates the bundled snapshot and prints its SHA-256 and count. It opens no database connection. Keep the versioned snapshot to recreate demo data after a development database reset; apply catalog migrations 002, 003 and 004 first on a new empty database.

## Deliberate development load

Use an ignored maintenance environment over verified TLS. Never change the runtime reader's permissions or put a database password in a command-line argument. The apply command requires the development label, exact expected host/database/user and the reviewed snapshot checksum; production NODE_ENV and enabled orders are rejected.

```sh
node --env-file=.env.maintenance scripts/seed-demo-catalog.mjs \
  --apply --environment development \
  --expect-host DEVELOPMENT_HOST --expect-database DEVELOPMENT_DATABASE \
  --expect-user DEVELOPMENT_MAINTENANCE_USER --expect-sha256 REVIEWED_SHA256
```

These guards prevent accidental mismatches; they do not independently prove that an arbitrarily labeled database is a development environment. Obtain authorization for the actual target. The current approval is for `botica-ya-dev` only.

The seed uses one transaction, the shared importer advisory lock, bounded database timeouts and bound SQL parameters. Directory creation and product insertion use JSON recordsets in batches, avoiding one network round trip per product. Existing demo IDs are skipped, preserving edits; a collision with a row lacking the exact demo description aborts the transaction. Inactive directories also abort rather than being silently reactivated. SKU uniqueness conflicts roll back. No row is deleted and unrelated records, identity tables and permissions are untouched.

This command deliberately publishes **only its explicitly authorized fictional dataset** with demo prices/stock/featured flags. The official-data importer remains separate and continues to create drafts with no commercial values. Never use this demo seed to publish a real catalog or restore operational inventory. Backups are still required for real data and manual edits.

## Verification

136 backend unit/integration tests passed using disposable PostgreSQL, including the 500-row load, idempotency, reader visibility, preservation of price/stock edits, collision rejection and inactive-directory rollback. Coverage exceeds the configured 80% minimum in every metric. The canonical snapshot checksum is `f075ddde4651894249a16d5318b20544028d07a8c473a5b6af1e70de22b30ba9`.

## Applied development evidence — 2026-11-17

The authorized seed from commit `5d46fcc` was applied deliberately to `botica-ya-dev` using the separate maintenance configuration: **500 inserted, 0 skipped**. The browser/runtime kept its existing restricted reader. No role, subscription, image bucket, order or identity record was changed.

Requests through the actual frontend URL `http://localhost:5173` returned:

- Featured and stocked, page size eight: 200, total 11, eight items; first ID `demo-product-0001`.
- Complete catalog, page size twelve: 200, total 500, 42 pages.
- Typo query `paracatamol`: 200, total 17, two pages.
- Category directory: six entries.

Browser checks confirmed the matching `DEMO-BY-0001` card with price S/ 4.50, eight featured cards and the demo notice. The Medicamentos filter returned 84 products across seven pages; the typo search showed matching Paracetamol demo cards. An empty submitted search displayed all 500 products and numbered page navigation; page two showed a distinct first item and returning to page one worked. This was the actual Supabase-backed API, not a stub or local fixture fallback. Product images remain the project's generic SVG.

Frontend typecheck, lint, build and 192 tests passed, including demo disclosure before purchase and fictional-data text at confirmation. The existing checkout simulation still explicitly creates no charge or real delivery. Code is stored locally on `codex/catalog-api-integration` in each repository; no merge or production publication was performed.

## Read-only database review before submission — 2026-11-17

Verified again through the dedicated runtime reader: 500 published demo products, 455 with stock, 12 featured (11 with stock), six categories, five brands and zero product images. All four catalog tables have RLS enabled and forced; effective reader permissions and actual client TLS passed verification. No identity rows were queried.

The deployed columns, category/brand/image foreign keys, normalized SKU uniqueness, vector/trigram indexes and published/featured pagination indexes are present. Both `unaccent` and `pg_trgm` are installed in `extensions`. No additional schema migration is required for the current demo listing/search scope. Zero image rows are intentional while the frontend uses its own generic graphic.

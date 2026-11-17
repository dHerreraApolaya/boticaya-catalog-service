# Development catalog integration evidence

Latest update: the owner subsequently authorized the project's fictional catalog and demo commercial values. **500 demo products are now loaded and visible**. See [the applied seed and browser evidence](DEMO_CATALOG.md). The empty-catalog checks below record the earlier connection stage; official DIGEMID data and real commercial publication remain outside this completed demonstration.

Date: 2026-11-17. Target: existing `botica-ya-dev` only. No production deployment, new project, plan upgrade or paid service was created.

## Cost and authorization

The user authorized a dedicated reader only if the Free plan and costs remained unchanged. The existing organization dashboard showed **Free plan usage**, one Nano project, 28/500 MB database usage and 0.00/5 GB egress before provisioning. The change creates a PostgreSQL role within the existing database, not another project or paid platform feature. No billing control was changed. General future usage remains subject to the existing Free quotas.

## Runtime identity

- Created `boticaya_catalog_reader_dev` with no administrative attributes, no replication and no BYPASSRLS; connection limit 10.
- Granted only the existing catalog reader group, with INHERIT true, SET false and ADMIN false.
- Set default read-only transactions, bounded statement/idle transaction timeouts and a `pg_catalog` search path.
- Generated a strong password locally and transmitted a SCRAM verifier to PostgreSQL over verified TLS. No credential was printed, committed or sent to the browser.
- Verified actual encrypted/authorized client TLS and the reader metadata checks before activating runtime configuration: all four catalog tables present with forced RLS, SELECT only, no table/column writes, no table ownership/schema CREATE, and no effective access to known public identity tables.
- Runtime `.env` now contains the reader. The original maintenance configuration is preserved separately in ignored `.env.maintenance`; both have permissions 0600. Do not load both into one process or expose them through frontend variables.

The verifier establishes a scoped metadata baseline, not a complete audit of every Supabase function/schema. See [CATALOG_RUNTIME.md](CATALOG_RUNTIME.md).

## Migration

Applied `sql/migrations/004-catalog-numbered-search.sql` from reviewed implementation commit `e3d597a`, after checking the exact development target, administrative identity, TLS and **zero existing product rows**.

SHA-256: `85366f3d3064e043cd94584f0f9f2becc33f571f136a842639a2e1349546f6a7`.

The migration committed successfully and the published-product trigram index was verified present. No catalog product, identity or checkout record was imported, published, edited or deleted. Migration tracking tables belonging to another service were not changed.

## Verification

- Backend typecheck, build and 132 unit/integration tests passed on an isolated local PostgreSQL instance. Configured coverage: 100% statements, branches, functions and lines.
- Injection strings, wildcard escaping, typo search, category OR filters, exact totals for empty/out-of-range pages, hidden drafts, restricted reader and importer rollback/idempotency passed.
- EXPLAIN ANALYZE on 20,002 fictional fixture rows, without disabling sequential scans: selective typo query used `products_search_text_gin` plus applicable SKU/vector indexes. Internal query 2.272 ms; complete restricted query with total and page 3.57 ms in that local run. These are test measurements, not a Supabase or production SLA; broad exact counts and deep offsets cost more.
- Backend dependency audit: no known vulnerabilities. Gitleaks reviewed change history: no findings.
- Actual runtime used the dedicated reader, listened only on `127.0.0.1`, and kept orders disabled.

Real Supabase-backed HTTP checks:

| Request | Result |
| --- | --- |
| `/api/categories` | 200, empty array |
| `/api/products/catalog?page=1&pageSize=12` | 200, total 0, items [], page 1, totalPages 1 |
| `/api/products/catalog?q=paracatamol` | 200, valid empty result |
| `/api/products/catalog?page=1001` | 400, generic invalid-search response |

Browser verification used the actual Vite same-origin proxy and Supabase-backed API, with no stub or fixture server. The landing page displayed the real empty featured state. Submitting `paracatamol` displayed the exact zero count, page 1 of 1, and the empty-search message. No fictional products appeared. This confirms the browser-to-API-to-Supabase path for an empty catalog.

Frontend checks passed: typecheck, build, lint, format, 191 component/unit tests, 12 hook tests and 8 engine-guard tests. Configured coverage: 99.47% statements, 96.87% branches, 100% functions, 99.69% lines. Compatible dependency updates reduced 22 findings (including 6 high) to one moderate ESLint/minimatch finding; no high or critical findings remain. The required Node version is now 22.22.2 because of the actual dependency requirements. Checks used an official Node 22.22.2 archive verified against its published SHA-256 in temporary storage; the user's global Node installation was not changed. The remaining moderate finding has no blanket exception or forced incompatible override.

## Open acceptance gates

No reusable DIGEMID dataset or written permission is available, and no real commercial input has been supplied. The owner explicitly chose **only real prices and stock**. Therefore no products have been imported or published, and a populated browser catalog has not been demonstrated. An empty response proves connectivity only. Complete the [business handoff](E2E_READINESS.md) before publication and comparison of real IDs/values across database, API and cards.

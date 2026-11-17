# Product module deployment — 2026-11-17

Environment: botica-ya-dev, Supabase development.

Applied SQL: migration 003-product-module.sql from commit 0365fc0f7d0401b931273a6868cec030c56459fd.

SHA-256: 4cdd2f203180d8bbbd7e975027f4de528816a6b568d0badc2f0a57e1092ea581.

## Verified deployment

The migration committed atomically after checking the target, TLS certificate, existing catalog state and role attributes. Created categories, brands and product_images, and evolved the existing products table. All four business tables have RLS enabled and forced. The catalog remains empty; no fixture data was loaded.

Reader write permissions are denied. Reader/editor access to existing identity tables is denied. Existing public identity table structures, grants and policy metadata fingerprints were unchanged. The editor role remains NOLOGIN without administrative attributes. Supabase public HTTP API roles have no table access. The candidate search helper has a fixed search path, no PUBLIC execution and a static published-only projection.

No checkout changes, Storage bucket creation, credential provisioning or public uploads were performed. Runtime credential activation and administration authorization remain separate tasks.

## Validation evidence

The reviewed commit passed all three GitHub checks. Integration tests cover 20,000 synthetic products in an isolated PostgreSQL instance. The selective inner query used products_sku_key_unique and products_search_gin; measured execution was 0.709 ms internally and 0.799 ms for the restricted outer query in that CI run. These are single-run diagnostic measurements, not a production SLA.

Configured application coverage was 100% in all four metrics. SQL behavior is verified by integration assertions rather than JavaScript coverage percentages. Production-like query volumes and broad prefixes still require workload measurement before larger scale operation.

A local Express smoke check against the empty development catalog verifies listing/search/legacy routes with HTTP 200 and unknown query parameters with HTTP 400. No product rows are retrieved or written during that empty-catalog check.

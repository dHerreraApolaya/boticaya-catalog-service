# Catalog browser contract

## API

`GET /api/categories` returns active `{id,name,slug}` entries ordered by display order, name and ID. Category IDs come from this directory, not frontend labels or ATC inference.

`GET /api/products/catalog` accepts only these query parameters:

| Parameter | Contract |
| --- | --- |
| q | Optional trimmed 3–128 characters, at most 12 whitespace-separated words |
| categoryIds | Optional CSV of 1–6 UUIDs, combined with OR |
| featured, inStock | Optional literal `true` or `false` |
| page | Integer 1–1000, default 1 |
| pageSize | Integer 1–50, default 12 |

The response is `{items,page,totalPages,total}`. Items include the existing search projection plus `categoryId` and nullable `brandId`. `total` is exact for the complete current filter, including when a requested page has no rows. `totalPages` is `max(1,ceil(total/pageSize))`, without truncation at the technical page bound. The frontend must ask users to refine a search if it exceeds that bound. Stable ordering is by product ID. Changes between separate requests can move page boundaries; this is not a multi-request frozen snapshot.

Only published products with active categories and active or absent brands are candidates. Outer joins retain RLS protection. Page and count share one SQL statement/snapshot and matching CTE. Images are optional metadata, selected once per result; no image download is required. Unknown/invalid parameters return 400; operational failures return generic 503 responses without raw database errors.

The cursor `/api/products/search` and legacy endpoints retain their existing contracts. Do not use the unpaginated legacy endpoint to integrate the web. A diagnostic administrator can bypass RLS; the runtime must use a verified restricted account.

## Matching and performance

Migration 004 adds normalized `search_text`, a trigger maintained alongside the original vector, and a partial GIN trigram index for published products. Existing product updates refresh it, including category/brand rename propagation. Exact normalized SKU, full-text prefixes and literal substring matching run first. Typo similarity is a fallback when no direct matches exist within the selected filters. It uses the indexed word-similarity operator and a fixed 0.6 threshold inside the helper, independent of connection settings. It does not implement clinical synonyms, recommendations or language translation.

The helper is static SQL, SECURITY DEFINER, returns IDs only, explicitly filters visibility and uses a fixed `pg_catalog` search path and qualified extension operator. PUBLIC execution is revoked. No client data becomes SQL syntax; LIKE wildcard characters are escaped as literals. Neither the extension nor indexes are created on server startup.

Selective searches can use existing vector/SKU indexes and the trigram index. Exact totals still require work proportional to the number of matches; offset navigation becomes more expensive at deeper pages. Do not describe this API as O(log n) overall or interpret a local measurement as a production latency guarantee. Inputs, page size, offset and database statement timeouts bound the request. Avoid downloading all rows or issuing one lookup per displayed image in application code.

PostgreSQL documents GIN support for word-similarity and LIKE in [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html). Validation uses the full disposable 20,000-product fixture and EXPLAIN ANALYZE without disabling sequential scans. See the deployment evidence for actual results; measure again after representative real data and traffic exist.

## Rollout

Apply reviewed migration 004 with a maintenance identity after migrations 002/003. It is a one-time transaction, not an idempotent runner. It backfills the normalized text and therefore advances existing product versions through the update trigger. Check extension placement before rollout; an unexpected schema aborts the migration. A busy production table would need a separately planned lock/index strategy; this task targets the existing empty development catalog.

Keep runtime reads, maintenance and import credentials separate. See [CATALOG_RUNTIME.md](CATALOG_RUNTIME.md), [CATALOG_IMPORT.md](CATALOG_IMPORT.md), and [E2E_READINESS.md](E2E_READINESS.md) for authorization, source rights, business inputs and the remaining acceptance gates. Loading drafts does not publish them, and successful empty responses do not prove that products were imported.

# Product module and indexed search

## Scope and ownership

Four business tables: products, categories, brands and product_images. Identity and checkout are unchanged. Migration 003 evolves the existing product IDs and legacy category/brand labels rather than replacing them. It does not create buckets, login credentials or an unauthenticated administration API. A dedicated NOLOGIN editor role is prepared; administration endpoints need explicit catalog authorization from the identity service.

## Keywords and matching

Products accept at most 30 nonempty keywords of at most 80 characters each. A database trigger normalizes case, diacritics and duplicates and maintains a weighted tsvector for SKU/name, keywords and brand/category/presentation. Keywords are curated commercial aliases, not automated clinical indications. Dictionary renames refresh dependent search documents in one database operation. This is intentional write amplification, so large category/brand renames should be measured before high-volume administration.

GET /api/products/search accepts q (3–128 characters, at most 12 whitespace-separated terms), categoryId, brandId, featured, after and limit (1–50, default 12). Matching is accent-insensitive token-prefix AND matching or exact normalized SKU. Arbitrary infix matching and typo correction are not promised. Empty q lists published products. Punctuation is treated as separators, never as tsquery operators. No user-selected SQL sort expression is accepted.

The existing GET /api/products response is unchanged. The new endpoint returns items and nextCursor. It sorts by stable existing product ID, not relevance. A caller must keep filters fixed between pages. Keyset pagination is not a repeatable snapshot during concurrent writes. It avoids deep OFFSET traversal and a full total-count query.

## Architecture and complexity

Zod validates the transport contract. The search use case depends on a repository interface; the PostgreSQL adapter owns SQL. SQL fragments are selected by trusted code and every client value is bound through pg parameters. No abstract factory, strategy hierarchy or facade is added without a concrete need.

The database filters, joins and orders results. A bounded LATERAL lookup retrieves one published image, avoiding N+1 queries or loading all images into Node. A nonempty query first normalizes its terms in one parameterized database call, then binds the canonical tsquery into the indexed lookup. This gives the planner a concrete search expression. The extra round trip is constant per search, not per product. A listing without q uses only the lookup. The application handles at most limit+1 results; slicing/serialization takes O(k) time and O(k) response memory where k <= 50. Query construction is O(L+F), with bounded query length L and a fixed number of filters F. Keyword deduplication is bounded at 30 elements; database DISTINCT/sorting has a small bounded cost.

No universal O(log N) claim is made for search. GIN candidate retrieval, term selectivity, matching rows, joins, security policies and cursor order affect actual cost. Partial GIN and B-tree indexes are candidates for the planner, not instructions to force a plan. Queries with broad prefixes may still visit many rows. Timeouts, maximum page/query size and future ingress rate limits bound exposure; application validation is not a substitute for rate limiting.

## Database guarantees

Normalized unique names/SKUs, foreign keys, prices/quantity checks, immutable product identifiers by convention, publication status, optimistic version increments and a private normalization schema. Products can be archived; editor roles cannot DELETE products/categories/brands. Images have unique object references, bounded sizes/formats/dimensions and publication constraints. Database metadata validation does not inspect or sanitize actual image bytes; a future upload processor must do so before marking an image published.

Reader RLS excludes draft/archived products, inactive categories/brands and pending image metadata. Editor access is limited to catalog tables and remains NOLOGIN until deliberately provisioned. Legacy label columns are compatibility projections maintained by triggers; clients should register products using category_id and brand_id. Other microservices cannot own these projection columns.

## Verification and SQL tuning

Integration tests use an isolated disposable PostgreSQL instance and a separate database, never Supabase. They exercise 20,000 synthetic products, safe migration/backfill, reader/editor behavior and EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) under both privileged and restricted roles. Do not force enable_seqscan=off or mark functions leakproof to make a plan appear faster. Explain results are diagnostic evidence, not a production latency SLA.

Supabase rollout must use the exact reviewed migration inside a transaction. Verify existing identity table metadata is unchanged, the expected four tables and indexes exist, role privileges/RLS are intact and there are no seeded products. ANALYZE affected catalog tables after a bulk import. For future large populated tables, separate index builds and assess CONCURRENTLY outside the schema transaction; do not reuse this initial-MVP migration blindly.

References: https://www.postgresql.org/docs/current/textsearch-indexes.html and https://node-postgres.com/features/queries

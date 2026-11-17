# Reproducible catalog imports

## Status and scope

The importer is ready for curated Peruvian product datasets. No official dataset is bundled and no DIGEMID records have been downloaded or imported: bulk reuse permission remains unverified. Website accessibility is not proof of permission. An accountable reviewer must verify the actual license or written permission before setting `reuse.status` to `confirmed`; the validator checks its presence, not its legal validity.

This process is independent from schema migrations. Apply catalog migrations 002 and 003 to an empty database before importing. `pnpm migrate` is the legacy order migration and must not be used to initialize a catalog-only database. Do not enable orders.

## Dataset contract

Use a JSON object with `schemaVersion: 1`, `source` and `products`. Unknown fields fail validation. Maximum 5,000 products and 10 MiB per file.

`source` requires:

- `namespace`: stable source identifier, lowercase ASCII letters/digits/hyphens, 3–40 characters. Never reassign a namespace to a different source.
- `country`: `PE`.
- `publisher`, `url` (HTTPS), `retrievedAt` (ISO datetime).
- `reuse`: `status: confirmed`, `licenseOrPermission`, `evidenceUrl` (HTTPS), `reviewedBy`, `reviewedAt` (ISO date). Preserve written permission separately when appropriate; never put secrets or private authorization URLs in Git.

Each product requires `externalId`, `name`, `category`, `brand` (string or null), `presentation`, `requiresPrescription` (verified boolean), and `keywords` (up to 30 strings, each 1–80 characters). IDs must be unique per **sellable presentation**. A sanitary registration can cover several presentations and is not necessarily a unique sellable product. Do not assume manufacturer equals brand. Exclude products whose presentation or prescription condition cannot be verified.

Archive the approved JSON, its license/evidence and SHA-256 digest in controlled storage. Retaining only a live URL cannot reproduce a dataset after a reset. Do not add third-party photographs, label artwork, clinical indications or scraped descriptions to this contract. Product images remain absent; the frontend supplies its generic SVG.

## Validate before connecting

```sh
pnpm build
pnpm import:catalog --file /absolute/path/approved-catalog.json
```

Default mode validates the file and prints record count and SHA-256 without opening a database connection. It does not simulate database constraints, inspect existing rows or prove licensing. Review the file and target configuration before applying.

## Apply to an explicitly authorized development database

Provide credentials through the ignored `.env` using existing TLS configuration and a catalog writer account, never frontend environment variables. The reader role cannot import; the importer does not create roles or change permissions. The command requires host, database and the exact reviewed checksum; it rejects `NODE_ENV=production`. These guards prevent accidental mismatches, not an incorrectly labeled production environment.

```sh
pnpm import:catalog --file /absolute/path/approved-catalog.json --apply --expect-host DEVELOPMENT_HOST --expect-database DEVELOPMENT_DATABASE --expect-sha256 REVIEWED_SHA256
```

All rows are inserted in one transaction with parameterized SQL, bounded timeouts and a shared transaction lock. Existing IDs are fetched once into a Set; directory IDs are cached in Maps. Processing is O(n) in application memory/time with bounded input; inserts remain sequential, suitable for the initial 500 records, not an unmeasured bulk-load SLA.

Stable IDs and SKUs derive from source namespace and external ID. Repeating a file skips existing IDs and preserves every existing product field, including commercial changes. This is an insert-only recovery/import tool, not a synchronization tool: corrections to already imported rows need a separate reviewed update. Unrelated uniqueness conflicts abort and roll back the entire transaction. Existing categories/brands are reused without changes, including inactive entries.

New products are **drafts**, with zero stock, zero price and no featured flag. Zero price is an unpublished placeholder, not an offer. Verify category/brand, current registration, prescription requirement, price and availability before a separate publication step. Imported drafts will not appear in the public search endpoint; loading this file alone does not finish frontend integration.

## Restore after deletion

For a new database: configure secure access, apply reviewed catalog migrations 002/003, validate the archived approved dataset, then apply with the new explicit target. If only imported products were deleted, rerun the same approved dataset. Never truncate shared tables or delete identity records as part of recovery.

This restores catalog metadata only. Use database backups for prices, inventory, manual edits, images and other operational state. Keep dataset snapshots until recovery and idempotency have been tested in a disposable database. No runtime request or application startup runs imports automatically.

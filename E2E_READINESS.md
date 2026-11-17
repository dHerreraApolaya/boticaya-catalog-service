# Catalog integration readiness

## Superseding development decision — 2026-11-17

The owner has now authorized the 500 **owned fictional products**, demo prices and demo stock so the real Supabase-backed catalog can be demonstrated. The earlier requirement to publish only owner-supplied real commercial values no longer applies to this development demo. It remains inappropriate to infer or fabricate commercial values for a real catalog. See [DEMO_CATALOG.md](DEMO_CATALOG.md). No DIGEMID data or unlicensed images are imported. The original real-catalog business handoff below remains pending separately.

## Approved business decisions — 2026-11-17

- Use products from the Peruvian market only. Prioritize DIGEMID and confirm bulk reuse rights before extracting or importing its catalog.
- No authorized catalog file or written permission is currently available. Do not mark permission as confirmed merely because a search page is public.
- Publish only products with real prices and stock supplied by the business owner. No synthetic commercial values, automatic publication, or zero-price offers.
- Keep typo-tolerant search, numbered pages and exact result totals.
- Keep the project's generic SVG while product photography is unavailable.
- Preserve multiple-category selection; category assignment and featured selection come from a reviewed business catalog, not an inferred ATC/manufacturer mapping.

## Responsibilities and handoff

| Role | Responsibility |
| --- | --- |
| Architecture / tech lead | API contracts, compatibility, coordinated integration and review |
| DBA | Schema, indexed search, isolation, restricted runtime identity, migration review and recovery |
| Senior fullstack developer | HTTP adapter, payload validation, API-backed UI and regression checks |
| Business analyst / owner | Rights, sellable presentations, classification, prescription verification, commercial inputs and publication approval |

Technical tests use fictional fixtures exclusively in disposable PostgreSQL. They cannot establish legal reuse rights, clinical correctness, price validity or permission to publish a real product.

## Remaining business inputs

1. Authorized source snapshot, reuse license or written permission, and retrieval date. Keep evidence with the archived dataset and checksum; do not put private evidence links or credentials in Git.
2. One row per sellable presentation, with a stable external ID. A registration number alone may cover multiple presentations. Verify name, packaging, current registration and condition of sale; unknown prescription requirements must not default to false.
3. Owner-approved commercial input keyed by the same source namespace and external ID: price in PEN cents, actual available quantity, commercial category, brand if applicable, and whether the item should be featured.
4. Named business reviewer and explicit approval of the subset to publish. Product loading creates drafts; publication is a separate reviewed operation. Inactive categories/brands and missing commercial inputs remain unpublished.

The commercial input is a handoff requirement, not an implemented CSV upload or synchronization feature. The existing importer deliberately does not update price, stock or publication state.

## Requesting source clarification

The [official DIGEMID procedures page](https://www.digemid.minsa.gob.pe/webDigemid/Tramites/) links to its virtual submission channel. A request should ask for a machine-readable product export or documented API, its allowed reuse in a commercial web catalog, permitted fields, attribution requirements, download/rate limits and update policy. Access to information and permission to republish are separate questions; request an explicit response about reuse. No request has been sent on the user's behalf.

Suggested request text:

> Solicitamos confirmar si existe una descarga oficial o API del catálogo de productos farmacéuticos registrados en Perú y cuáles son las condiciones para reutilizar sus datos en el catálogo web de una botica. Necesitamos identificar cada presentación, registro sanitario, nombre, forma/concentración, fabricante/titular y condición de venta. Agradeceremos indicar licencia o autorización aplicable, atribución, límites de acceso y actualización. No solicitamos fotografías, obras gráficas ni información personal. No realizaremos extracción masiva mientras no se aclaren estas condiciones.

The open-data license indexed for an unrelated CENARES distribution dataset does not authorize extraction of DIGEMID's registry. Distribution records also do not necessarily identify sellable commercial presentations or prescription conditions. No alternative dataset has been substituted for the approved source scope.

## Evidence and rollout gates

- Supabase connectivity: read-only connection/projection verification passed on 2026-11-17 without retrieving product rows. This confirms connection/TLS/projection, not restricted runtime privileges or a populated catalog.
- Import utility: insert-only, transactional, stable IDs, default validation-only mode; see [CATALOG_IMPORT.md](CATALOG_IMPORT.md).
- Migration 004: validated in isolated PostgreSQL and applied deliberately to the empty development catalog. It is not executed by tests or application startup. See [deployment evidence](CATALOG_INTEGRATION_DEPLOYMENT.md).
- Runtime identity: dedicated reader provisioned with explicit user authorization conditioned on maintaining Free. TLS and effective restricted permissions verified before activating the local runtime configuration. Administrative credentials are separated in ignored maintenance configuration.
- Actual API smoke test: categories and numbered/typo catalog requests returned 200 with empty results through the reader; an excessive page returned 400. This proves the API-to-Supabase path, not product display.
- The owned development demo is now loaded and visible through the actual browser/API/Supabase path; see [applied demo evidence](DEMO_CATALOG.md). Source approval and real commercial inputs remain pending for a separate real catalog.

Final acceptance must compare the same approved published product IDs and commercial values across Supabase, the HTTP response and browser cards, then exercise typo search, category combinations, exact totals, page navigation, empty/error states and draft invisibility. Confirm no silent fallback to local fixtures and keep orders disabled. A successful empty API response is a connectivity check, not proof that products were imported or displayed.

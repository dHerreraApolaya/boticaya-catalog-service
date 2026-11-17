# Read-only catalog demo on Vercel

Status: deployment preparation on pre-develop, based on merged catalog integration PR #6. No paid services are authorized. The owner authorized a narrow temporary exception on 2026-11-17 for GHSA-fc5q-39xc-vjpf in development-only picomatch 4.0.7; see [the canonical exception](DEMO_SECURITY_EXCEPTION.md). Complete and runtime reports remain mandatory; main/develop do not accept this exception.

## Contract and architecture

The root index.ts is the native Vercel Express entry. src/server.ts remains the local server. Public requests pass through the public boundary before the existing transport, validation, service and parameterized PostgreSQL repository layers. Only GET/HEAD /api/categories, /api/products/catalog, /api/products/search and /healthz are exposed. OPTIONS is available for CORS. Legacy unbounded product/inventory endpoints and orders are unavailable. URL length is limited to 2048; existing search/page-size validators still apply. Health indicates process liveness, not database readiness.

Only the approved HTTPS web origin receives CORS permission, without cookies/credentials. Requests without Origin remain allowed: this is a public API, and CORS is not authentication or bot protection. Responses have no-store and defensive JSON headers. Operational errors never expose database messages. Readiness checks TLS authorization and catalog reader permissions before catalog access; concurrent cold requests share a check, and failures can retry. The result is cached per warm instance; role changes require a redeployment to repeat readiness checks.

A module-scoped pg pool is registered with @vercel/functions attachDatabasePool. Each instance is limited to two connections, with 5s idle/connect timeouts and a 10s statement timeout. This deliberately small demo cap balances Fluid concurrency with the development reader connection limit; total connections can still multiply as instances scale. It is not a global limiter. Confirm the Supabase transaction pooler connection in the dashboard, normally port 6543; use unnamed parameterized queries and retain certificate verification.

## Deployment settings, no secret values

Use a separate Vercel project connected to boticaya-catalog-service, Express framework, Node 22.x, pnpm 9.15.4, build pnpm build. Git auto deployment is disabled in vercel.json until the release gates are satisfied. Do not enable paid integrations, managed OWASP rulesets, paid rate limiting, databases, trials or plan upgrades. Hobby is restricted to personal/non-commercial use; confirm eligibility with the owner before publishing a business prototype. Stop if the account requires payment.

Configure only the intended deployment environment in Vercel:

| Variable | Value source | Handling |
| --- | --- | --- |
| BOTICAYA_DB_HOST | Exact botica-ya-dev transaction pooler host from dashboard | Server configuration |
| BOTICAYA_DB_PORT | Verified transaction pooler port | Server configuration |
| BOTICAYA_DB_NAME | postgres | Server configuration |
| BOTICAYA_DB_USER | Dedicated catalog reader, with project suffix | Server configuration |
| BOTICAYA_DB_PASSWORD | Existing local reader credential, transferred through secure account configuration | Vercel Secret; never logs, chat, repository, frontend or build arguments |
| BOTICAYA_DB_SSL | true | Required |
| BOTICAYA_DB_CA_PEM | Full trusted public Supabase CA PEM with real newlines | Server configuration; omit CA_FILE |
| BOTICAYA_ORDERS_ENABLED | false | Required |
| BOTICAYA_WEB_ORIGIN | Exact published frontend HTTPS origin, without path or trailing slash | Required; no wildcard |

Do not upload .env or .env.maintenance, administrative passwords, Supabase service_role keys or local certificate paths. No Supabase API key is needed. .vercelignore excludes local environments, fixtures, SQL and tooling from uploads; .gitignore must additionally ignore .vercel project metadata. Environment variables are never VITE_ prefixed. Vercel Secrets do not replace disciplined logging or credential rotation after exposure.

## Release gates and checks

1. Merge reviewed catalog integration, then review this deployment change against the current base. Pass typecheck, unit tests, disposable PostgreSQL integration coverage, build, filename/Gitleaks scans and the complete/runtime dependency audit under the explicitly authorized demo policy.
2. Confirm account plan eligibility and zero-cost features in the dashboard. Enable only verified included DDoS/custom firewall controls. Assess rate limiting before making the API public; do not claim a distributed limit exists in this code. No per-process IP map is used because serverless instances cannot enforce a shared quota.
3. Verify the reader credential and inline CA through secure server configuration. Never copy maintenance credentials. No migrations or demo reload are needed: Supabase already holds 500 fictional products. No production or identity tables are changed.
4. Verify native Express entry discovery with a Vercel build and deployment preview. Local tsc is not evidence of Vercel bundling. Ensure the chosen entry is root index.ts, not src/server.ts.
5. Smoke-test health, catalog pagination/count, fuzzy search, categories, invalid parameters, rejected POST/orders/legacy endpoints, unapproved origins and generic failure responses. Ensure actual runtime TLS/reader verification succeeds. Load checks must respect free quotas; do not stress shared development Supabase.
6. Wire the frontend to the verified public API URL, either using an /api rewrite before its SPA fallback or its existing public API-base setting. Keep demo notices visible and orders disabled. Validate published web network requests and product rendering.
7. Record deployment URL, commit, checks, reader verification and included firewall controls. Roll back the Vercel deployment if validation fails; no database rollback or destructive reset is needed.

## Current local evidence

- Typecheck, 98 unit/boundary tests, build, sensitive-file guard and Gitleaks directory scan passed.
- Disposable PostgreSQL integration coverage: 151 tests passed; statements/lines/functions 100%, branches 98.7%. Supabase was not used for tests.
- Complete audit reports the high-severity picomatch advisory. Only the documented temporary development exception is authorized on pre-develop.
- Vercel-native build, public deployment, frontend origin, account eligibility and platform firewall configuration are not yet verified.

References: https://vercel.com/docs/frameworks/backend/express ; https://vercel.com/kb/guide/connection-pooling-with-functions ; https://supabase.com/docs/guides/database/connecting-to-postgres ; https://vercel.com/docs/environment-variables/sensitive-environment-variables ; https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing ; https://vercel.com/legal/terms .

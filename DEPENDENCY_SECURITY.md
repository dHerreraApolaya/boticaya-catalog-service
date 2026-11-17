# Dependency review at PR submission — 2026-11-17

The complete dependency audit is currently blocked by **one high development-tool finding**: [picomatch repeated-extglob ReDoS, GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The reviewed advisory was updated on 2026-11-17, affects versions <=4.0.7 and identifies no patched release. The official npm registry's latest version was confirmed as 4.0.7.

`pnpm why picomatch` locates it under the Vitest/Vite/tinyglobby development toolchain. The production-only audit returned no known vulnerabilities. This distinction narrows the known dependency exposure but does not authorize an exemption from development-tool security. Keep untrusted glob patterns out of configuration and keep local dev services bound to loopback; these measures do not resolve the advisory or make the complete audit pass.

CI quality passed with 138 tests and the secret scan passed. `pnpm audit --audit-level high` correctly fails on the full graph, so the PR remains blocked for merge. No audit threshold, ignore list or required branch check was relaxed. No affected-version downgrade, unreviewed patch or forced dependency override was added.

An upstream corrected release, or a separately reviewed supported toolchain migration, is required before approving the dependency gate. Earlier deployment documents record the audit result at their original verification time; this is the current submission status. No further Supabase schema, permission, product or billing change is needed for this dependency finding.

# Contributing

Branch from the current default branch. Keep one concern per PR and use Conventional Commits. Include the problem, behavior, contract changes and exact validation results. Review generated code as carefully as handwritten code; authors remain accountable.

Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit --audit-level high` and `node scripts/check-sensitive-files.mjs`. For integration coverage set BOTICAYA_TEST_DATABASE_URL to a disposable PostgreSQL database ending in `_test` and run `pnpm test:coverage`. Never use Supabase production for tests.

Integration fixtures that create their own database must register `trackPoolShutdown` before opening connections and await it after closing the HTTP server. This waits for every client `end` event, since the pool may resolve its own end promise before socket closure finishes. Drop the isolated database without FORCE; unexpected open sessions must fail cleanup rather than being terminated behind the test runner. The CI teardown regression is covered independently, and 138 tests passed in two consecutive isolated runs after the fix.

Install local Git hooks with `git config core.hooksPath .githooks`. Install the official Gitleaks CLI separately. Commit hooks fail closed when it is unavailable. Hooks are convenience controls; required GitHub checks enforce review centrally.

Main must use PRs, one eligible independent approval, stale approval dismissal, code-owner review, resolved discussions, current base and required passing checks. Block force pushes and deletion with no routine bypass. CODEOWNERS identifies ownership but does not itself grant repository access. If the owner is also the author, another eligible reviewer must review sensitive changes. Add designated team reviewers through a separate authorized access change.

Required checks after a successful initial run: Express API and PostgreSQL, Secret scan, Dependency audit. Do not require nonexistent checks. Exceptions need a reviewed PR with owner, reason and expiry; do not broadly suppress scanners.

## Verified rollout — 2026-11-17

Main protection is active in GitHub ruleset 27438507, with no bypass actors and the three required GitHub Actions checks verified passing. Repository secret protection, push protection, dependency graph, Dependabot alerts/security updates, malware alerts and private vulnerability reporting are enabled. CODEOWNERS is advisory until a suitable independent ownership group is assigned; code-owner approval is not enforced by the current ruleset. Independent PR approval is mandatory. The versioned ruleset is a snapshot, not an automatic settings deployment.

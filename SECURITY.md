# Security

Do not report vulnerabilities or secrets in public issues. Use GitHub private vulnerability reporting when enabled, or contact the repository owner privately without disclosing credentials publicly.

Keep `.env` outside Git and use empty `.env.example` placeholders. Server database credentials must never use `VITE_`. Use distinct least-privilege database roles for catalog reads, order writes and migrations; keep orders disabled until the environment is intentionally configured. Retain certificate verification for remote TLS connections.

Local hooks scan staged changes with Gitleaks and block sensitive filenames. CI also scans Git history and audits development and runtime dependencies, failing on high or critical findings. Scanner coverage is incomplete: arbitrary passwords and novel vulnerabilities may be missed. Review all externally supplied code and dependencies.

If a real credential was committed: revoke or rotate first, identify exposure, review access logs, then coordinate any history cleanup. Deletion alone does not revoke it. Do not print secrets in CI or attach raw scan reports. Historical findings must be triaged without blanket allowlists.

GitHub settings must separately enable repository secret scanning, push protection, dependency graph, Dependabot alerts and private vulnerability reporting where available. Workflow files do not activate these settings. Branch rules must be verified in GitHub after checks pass.

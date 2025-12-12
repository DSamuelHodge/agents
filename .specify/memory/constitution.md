# Project Constitution

## Core Principles

### I. Test-First (MUST)
All new endpoints and UI flows require failing tests before implementation; follow Red-Green-Refactor; block merge on failing tests.

### II. Observability & Errors (MUST)
Return structured JSON errors (`{message, details, code?}`); log with correlation ids; no silent failures.

### III. Secret Hygiene (MUST)
Secrets are never in client bundles or repo; only via `wrangler secret put` or env injection; fail fast if missing.

### IV. Simplicity & Scope (SHOULD)
Prefer minimal infra (one Worker, one storage primitive) unless justified; document any added complexity in plan.md.

### V. Performance & Resilience (SHOULD)
Workflows target p95 ≤ 60s; UI status updates ≤ 2s; implement retries/backoff for transient LLM/network failures.

## Governance

Constitution supersedes other docs; violations need explicit justification in plan.md "Complexity Tracking"; reviewers must check compliance.

**Version**: 1.0.0 | **Ratified**: 2025-12-11 | **Last Amended**: 2025-12-11

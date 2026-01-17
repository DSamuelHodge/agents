# Stage 4 Execution Contract: Validation Pipeline Modernization

## Objective
Extract validation (linting, formatting, quality gate) to a dedicated Worker and optimize quality checks.

## Immutable Assumptions
- No user-facing API endpoints or workflow orchestration may break or regress.
- Data and artifact integrity must be preserved (no loss or corruption during migration).
- All migrations must be reversible or have a rollback plan.
- All experimental/legacy code has been removed (Stage 1 complete).
- Cloudflare Workflows, D1, R2, and KV are established (Stages 2-3 complete).

## Inputs
- Existing validation logic (linter.ts, tester.ts, feedback-loop.ts).
- Current quality gate implementation.
- Cloudflare documentation: https://developers.cloudflare.com/llms.txt
- Validation pipeline requirements from REFACTOR.md.

## Outputs
- New: Dedicated validation Worker for linting, formatting, and quality checks.
- Updated: Workflow pipeline to call external validation Worker instead of in-worker validation.
- Updated: Quality gate logic optimized for performance.
- Updated: Tests for new validation pipeline.

## Constraints
- Use only Cloudflare-supported modules and patterns (see official docs).
- No changes to artifact storage, workflow orchestration, or GitHub integration.
- No new features or user-facing API changes (migration only).
- All validations must be idempotent and non-blocking.

## Disallowed Actions
- Do not modify artifact storage, workflow orchestration, or GitHub integration.
- Do not introduce new features or abstractions outside validation migration.
- Do not remove or alter user-facing API contracts.

## Validation Criteria
- All tests pass (no regressions).
- Build and lint pass with zero errors/warnings.
- All validation is handled by external Worker (no in-worker validation).
- Quality gate performance improved (faster, more reliable).
- No user-facing regressions (API, workflow, artifact access).

## Test Requirements
- Expected coverage: ≥90% line coverage (no decrease from baseline).
- Critical paths: Validation API, quality gate execution, error handling.
- Edge cases: Validation failures, network timeouts, malformed inputs.
- Integration: All modules referencing validation are updated and tested.

---
This contract is committed before implementation. Proceeding to implementation after commit (AUTONOMY_LEVEL: HIGH).
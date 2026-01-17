# Stage 2 Execution Contract: Cloudflare Workflows & D1 Foundation

## Objective
Establish Cloudflare Workflows for durable workflow orchestration and D1 for structured data storage, replacing legacy Durable Object patterns and manual SQL.

## Immutable Assumptions
- No user-facing API endpoints or workflow orchestration may break or regress.
- Data and artifact integrity must be preserved (no loss or corruption during migration).
- All migrations must be reversible or have a rollback plan.
- All experimental/legacy code has been removed (Stage 1 complete).

## Inputs
- Existing workflow orchestration logic (Durable Objects, manual SQL, legacy endpoints).
- Current workflow, step, and audit data models.
- Cloudflare documentation: https://developers.cloudflare.com/llms.txt
- D1 schema and migration plan from REFACTOR.md.

## Outputs
- New: Cloudflare Workflow entrypoint module for agent orchestration.
- New: D1 schema and migration scripts for workflows, steps, audit events, and settings.
- Updated: Workflow orchestration logic to use Workflows and D1 (not Durable Objects).
- Updated: API endpoints to use new orchestration and storage.
- Updated: Tests for new workflow and storage logic.

## Constraints
- Use only Cloudflare-supported modules and patterns (see official docs).
- No changes to artifact storage, validation pipeline, or GitHub integration.
- No new features or user-facing API changes (migration only).
- All data migrations must be idempotent and reversible.

## Disallowed Actions
- Do not modify artifact storage, validation, or GitHub integration.
- Do not introduce new features or abstractions outside workflow/storage migration.
- Do not remove or alter user-facing API contracts.

## Validation Criteria
- All tests pass (no regressions).
- Build and lint pass with zero errors/warnings.
- All workflow and audit data is preserved and accessible via D1.
- All workflow orchestration is handled by Cloudflare Workflows (no Durable Objects).
- No user-facing regressions (API, workflow, artifact access).

## Test Requirements
- Expected coverage: ≥90% line coverage (no decrease from baseline).
- Critical paths: Workflow API, step execution, audit trail, data migration.
- Edge cases: Migration with partial/incomplete data, workflow retries, D1 failures.
- Integration: All modules referencing workflow orchestration and storage are updated and tested.

---
This contract is committed before implementation. Proceeding to implementation after commit (AUTONOMY_LEVEL: HIGH).
# Stage 1 Execution Contract: Experimental & Legacy Code Removal

## Objective
Eliminate all experimental and legacy code (codemode orchestrator, legacy HTTP endpoints, unused Durable Objects) to reduce technical debt and prepare for Cloudflare-native migration.

## Immutable Assumptions
- No user-facing API endpoints or workflow orchestration may break or regress.
- Data and artifact integrity must be preserved (no deletion of workflow or artifact data).
- All migrations must be reversible or have a rollback plan.

## Inputs
- Source files: `worker/src/agents/codemode-orchestrator.ts`, `worker/src/index-legacy.ts`, all references to codemode, legacy HTTP, and unused Durable Objects.
- Test files referencing codemode or legacy endpoints.
- Import statements in other modules referencing removed code.

## Outputs
- Deleted: `worker/src/agents/codemode-orchestrator.ts`, `worker/src/index-legacy.ts`, and any other experimental/legacy files.
- Updated: All imports and references to removed code.
- Updated: Tests to remove codemode/legacy scenarios.

## Constraints
- No new features or architectural changes.
- No changes to data migration, artifact storage, or workflow logic.
- No changes to user-facing API contracts.
- Only remove code that is strictly experimental or legacy as defined in REFACTOR.md.

## Disallowed Actions
- Do not remove or refactor any code outside the explicit experimental/legacy scope.
- Do not modify workflow, artifact, or audit data.
- Do not introduce new abstractions or features.

## Validation Criteria
- All tests pass (no regressions).
- Build and lint pass with zero errors/warnings.
- No references to codemode, legacy HTTP, or unused Durable Objects remain.
- No user-facing regressions (API, workflow, artifact access).

## Test Requirements
- Expected coverage: ≥90% line coverage (no decrease from baseline).
- Critical paths: Workflow API, artifact access, audit trail.
- Edge cases: Absence of removed code does not break any flows.
- Integration: All modules referencing removed code are updated and tested.

---
This contract is committed before implementation. Awaiting approval or auto-approval (AUTONOMY_LEVEL: HIGH).
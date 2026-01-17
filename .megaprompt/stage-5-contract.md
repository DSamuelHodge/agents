# Stage 5 Execution Contract: GitHub Integration Enhancement

## Objective
Refactor PR creation, webhook handling, and approval automation using service binding patterns.

## Immutable Assumptions
- No user-facing API endpoints or workflow orchestration may break or regress.
- Data and artifact integrity must be preserved (no loss or corruption during migration).
- All migrations must be reversible or have a rollback plan.
- All experimental/legacy code has been removed (Stage 1 complete).
- Cloudflare Workflows, D1, R2, KV, and validation worker are established (Stages 2-4 complete).

## Inputs
- Existing GitHub integration logic (artifact manager, PR creation).
- Current webhook handling and approval automation.
- Cloudflare documentation: https://developers.cloudflare.com/llms.txt
- GitHub API integration requirements from REFACTOR.md.

## Outputs
- New: Service binding pattern for GitHub operations.
- Updated: PR creation logic to use R2 artifacts and D1 metadata.
- Updated: Webhook handlers for status updates and approvals.
- Updated: Approval automation with service bindings.
- Updated: Tests for new GitHub integration.

## Constraints
- Use only Cloudflare-supported modules and patterns (see official docs).
- No changes to artifact storage, workflow orchestration, or validation pipeline.
- No new features or user-facing API changes (migration only).
- All GitHub operations must be secure and rate-limited.

## Disallowed Actions
- Do not modify artifact storage, workflow orchestration, or validation pipeline.
- Do not introduce new features or abstractions outside GitHub integration.
- Do not remove or alter user-facing API contracts.

## Validation Criteria
- All tests pass (no regressions).
- Build and lint pass with zero errors/warnings.
- All GitHub operations use service binding patterns.
- PR creation and webhook handling are reliable and secure.
- No user-facing regressions (API, workflow, artifact access).

## Test Requirements
- Expected coverage: ≥90% line coverage (no decrease from baseline).
- Critical paths: PR creation, webhook handling, approval automation.
- Edge cases: GitHub API failures, rate limits, malformed webhooks.
- Integration: All modules referencing GitHub operations are updated and tested.

---
This contract is committed before implementation. Proceeding to implementation after commit (AUTONOMY_LEVEL: HIGH).
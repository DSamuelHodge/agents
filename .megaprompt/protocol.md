# Staged Development Protocol: Cloudflare-Native Migration

## Stage 1: Experimental & Legacy Code Removal
- **Objective:** Eliminate all experimental and legacy code (codemode orchestrator, legacy HTTP endpoints, unused Durable Objects).
- **Primary Concern:** Codebase safety and minimal regression risk.
- **Out-of-Scope:** Any new feature development, data migration, or architectural changes.
- **Criticality:** Critical path.

## Stage 2: Cloudflare Workflows & D1 Foundation
- **Objective:** Establish Cloudflare Workflows for orchestration and D1 for structured data storage.
- **Primary Concern:** Durable, reliable workflow execution and data integrity.
- **Out-of-Scope:** Artifact storage migration, validation pipeline changes, GitHub integration.
- **Criticality:** Critical path.

## Stage 3: Artifact Storage & KV Caching
- **Objective:** Migrate artifact storage to R2 and implement KV-based agent response caching.
- **Primary Concern:** Data accessibility and cache correctness.
- **Out-of-Scope:** Validation pipeline, GitHub integration, workflow logic changes.
- **Criticality:** Critical path.

## Stage 4: Validation Pipeline Modernization
- **Objective:** Extract validation (linting, formatting, quality gate) to a dedicated Worker and optimize quality checks.
- **Primary Concern:** Validation accuracy and performance.
- **Out-of-Scope:** Artifact storage, workflow orchestration, GitHub integration.
- **Criticality:** Critical path.

## Stage 5: GitHub Integration Enhancement
- **Objective:** Refactor PR creation, webhook handling, and approval automation using service binding patterns.
- **Primary Concern:** Automation reliability and security.
- **Out-of-Scope:** Validation, artifact storage, workflow orchestration.
- **Criticality:** Critical path.

## Stage 6: Testing, Documentation, and Finalization
- **Objective:** Achieve ≥90% test coverage, update documentation, and prepare for production readiness.
- **Primary Concern:** Test quality and documentation completeness.
- **Out-of-Scope:** Any new features or refactors.
- **Criticality:** Critical path.

---
- Stages are strictly sequential and composable.
- Each stage addresses a single concern.
- Earlier stage decisions are immutable unless explicitly reopened.
- No stage mixes unrelated concerns.

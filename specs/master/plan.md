# Implementation Plan: Digital Twin MVP integration

**Branch**: `[digital-twin-mvp]` | **Date**: 2025-12-11 | **Spec**: `/specs/master/spec.md`
**Input**: Feature specification from `/specs/master/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Integrate the 9-agent Digital Twin MVP into the existing React/Vite app by exposing Cloudflare Worker endpoints (`/workflow`, `/agent/:role/init|chat`, `/status`) backed by Gemini. Replace the simulated frontend workflow with real API calls, maintain per-run context (Durable Object/KV+D1), and surface live status/errors in the UI.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript (Workers + React), React 19, Vite 7, Wrangler runtime  
**Primary Dependencies**: Cloudflare Workers runtime, Durable Object or KV+D1 for context, `@google/genai` for Gemini calls, React + lucide-react for UI  
**Storage**: Durable Object for workflow coordination (preferred, authoritative, per-run isolation); KV optional for lightweight cache; D1 optional for persistence snapshots  
**Testing**: Vitest for frontend/unit; `@cloudflare/vitest-pool-workers` for Worker tests; manual `wrangler dev` e2e (add automation later)  
**Target Platform**: Cloudflare Workers (edge), React SPA in Vite  
**Project Type**: Web app + edge worker backend  
**Performance Goals**: End-to-end workflow <= 60s (Gemini free tier); UI status updates within 2s of step completion  
**Constraints**: Free-tier limits (Workers 100k req/day, Gemini 15 req/min), avoid bundling secrets; max request body 256 KB with rejection (413) and guidance; featureRequest >8k chars summarized before LLM; Gemini input capped at ~32k tokens with truncation notice  
**Scale/Scope**: Single SPA + one Worker service; 9-agent sequential workflow with optional role chat

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file is placeholder/undeclared (all sections empty). Gate outcome: proceed with default engineering best practices; mark NEEDS CLARIFICATION to ratify principles (testing, observability, change control). No explicit prohibitions detected.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
frontend/ (existing Vite app)
└── src/
  ├── pages/
  │   └── dashboard.tsx        # Digital Twin UI (to be API-backed)
  ├── services/                # Add api client for Workers
  └── assets/

worker/
└── src/
  ├── index.ts                 # Worker entry (workflow + agent endpoints)
  ├── workflow.ts              # 9-agent orchestration logic
  ├── agents/                  # Role prompts/handlers
  ├── storage/                 # DO/D1/KV bindings helpers
  └── utils/                   # Gemini client, validation

tests/
├── frontend/                    # Vitest UI state/tests
└── worker/                      # @cloudflare/vitest-pool-workers tests
```

**Structure Decision**: Web app + edge Worker backend. Frontend remains under `src/`; backend Worker code under new `worker/` with storage + agents modules; tests split by frontend/worker.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

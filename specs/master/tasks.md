# Tasks: Digital Twin MVP integration

**Input**: Design documents from `/specs/master/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare repo structure and configs for Worker + frontend integration.

- [x] T001 Ensure Cloudflare Wrangler available and log in for this repo (`wrangler login`) – no code change
- [x] T002 Create `worker/` scaffold with `src/index.ts` entry and placeholder exports
- [x] T003 [P] Add `worker/src/workflow.ts` module stub for orchestrator
- [x] T004 [P] Add `worker/src/agents/roles.ts` with role metadata (ids, prompts, order)
- [x] T005 [P] Add `worker/src/utils/types.ts` defining shared DTOs (WorkflowRun, AgentStep, errors)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend/client plumbing required before any story.

- [x] T006 Configure `wrangler.toml` bindings for Durable Object (preferred) or KV+D1 (choose and document) and Gemini key reference
- [x] T007 [P] Implement storage adapter in `worker/src/storage/context.ts` (DO or KV+D1) with CRUD for workflow runs and steps
- [x] T008 [P] Implement Gemini client wrapper in `worker/src/utils/gemini.ts` using `@google/genai`, reading `GEMINI_API_KEY` from env
- [x] T009 [P] Define API response/error helpers in `worker/src/utils/responses.ts` (JSON success/error shapes)
- [x] T010 Establish frontend API client in `src/services/api.ts` with base fetch wrapper and error handling
- [x] T011 Add env documentation (README snippet) on setting `GEMINI_API_KEY` via `wrangler secret put` and keeping it out of client bundles
- [x] T011a [P] Add request-size validation/truncation in `worker/src/index.ts` (reject >256 KB with 413 + guidance; summarize featureRequest >8k chars before LLM)

**Checkpoint**: Backend storage + Gemini client + API client ready; proceed to user stories.

---

## Phase 3: User Story 1 - Run full workflow (Priority: P1) 🎯 MVP

**Goal**: Submit a feature request, run 9-agent sequence, return ordered outputs.

**Independent Test**: From UI, submit feature request and see per-agent statuses/outputs (PM → Architect → Database → Backend → Frontend → DevOps → QA → Tech Writer).

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement workflow orchestrator in `worker/src/workflow.ts` to run roles sequentially with context chaining
- [x] T013 [US1] Implement `POST /workflow` handler in `worker/src/index.ts` wiring orchestrator and storage
- [x] T014 [P] [US1] Add role execution functions in `worker/src/agents/execute.ts` that call Gemini with role prompts
- [x] T015 [US1] Persist and update step statuses/outputs in storage adapter during workflow execution
- [x] T016 [US1] Update `src/pages/dashboard.tsx` to replace `simulateAgentWork` with real `/workflow` API call and status polling/streaming
- [x] T017 [P] [US1] Add UI rendering for returned outputs/errors in `src/pages/dashboard.tsx` (statuses, snippets, error banners)
- [x] T018 [P] [US1] Add API typing and client method `runWorkflow` in `src/services/api.ts`
- [x] T019 [US1] Add minimal worker test for `/workflow` happy path using `@cloudflare/vitest-pool-workers` in `tests/worker/workflow.test.ts`
- [x] T020 [P] [US1] Add frontend state test for workflow reducer/logic in `tests/frontend/workflow.test.ts`
- [ ] T020a [US1] Add timing/metrics logging in `worker/src/workflow.ts` (per-step + total duration) and include in response metadata/logs
- [x] T020b [P] [US1] Add frontend test asserting workflow error banner renders `{message, details}` from worker responses

**Checkpoint**: Workflow end-to-end functional from UI → Worker → Gemini → UI display.

---

## Phase 4: User Story 2 - Role-scoped chat (Priority: P2)

**Goal**: Call a specific agent with context without full workflow.

**Independent Test**: POST `/agent/backend/chat` with context returns structured role output and renders in UI.

### Implementation for User Story 2

- [x] T021 [P] [US2] Implement `POST /agent/:role/chat` handler in `worker/src/index.ts` with role validation
- [x] T022 [P] [US2] Reuse role executor to handle single-step chat in `worker/src/agents/execute.ts`
- [ ] T023 [US2] Extend storage adapter to record ad-hoc role chat sessions in `worker/src/storage/context.ts`
- [x] T024 [P] [US2] Add `agentChat` client method in `src/services/api.ts`
- [ ] T025 [US2] Add UI affordance in `src/pages/dashboard.tsx` to trigger role-scoped chat and display response
- [x] T026 [P] [US2] Add worker test covering invalid role and valid chat in `tests/worker/agent-chat.test.ts`

**Checkpoint**: Role chat callable and visible independently of workflow.

---

## Phase 5: User Story 3 - Status & resilience (Priority: P3)

**Goal**: Health/status visibility and graceful failure handling.

**Independent Test**: `/status` reports readiness; errors during workflow/chat surface with JSON error bodies and UI notices; retry/backoff available for transient failures.

### Implementation for User Story 3

- [x] T027 [P] [US3] Implement `GET /status` in `worker/src/index.ts` checking env bindings and storage availability
- [x] T028 [US3] Add retry/backoff wrapper for Gemini calls in `worker/src/utils/gemini.ts` and integrate with orchestrator/chat
- [x] T029 [P] [US3] Add structured error reporting and logging hooks in `worker/src/utils/responses.ts`
- [ ] T030 [US3] Surface failure states and retry affordance in `src/pages/dashboard.tsx`
- [x] T031 [P] [US3] Add worker test for `/status` and simulated Gemini failure path in `tests/worker/status.test.ts`
- [x] T031a [P] [US3] Add worker test asserting 413/error bodies include `{message, details}` and that oversized requests are rejected
- [x] T031b [P] [US3] Add frontend test asserting per-step status UI updates within 2s (simulate worker responses)

**Checkpoint**: Health reporting and resilience behaviors verified.

---

## Phase N: Polish & Cross-Cutting Concerns

- [x] T032 [P] Documentation updates for API usage and local dev in `README.md` and `specs/master/quickstart.md`
- [x] T033 [P] Add lint-format hooks or CI task entry if missing in `package.json`
- [x] T034 Performance and log tuning (response sizes, truncation, structured logs) across Worker modules
- [x] T035 [P] Frontend UX polish (loading states, copy, accessibility) in `src/pages/dashboard.tsx`
- [x] T036 Security pass: verify no secrets in client build; audit `wrangler.toml` and storage permissions

---

## Dependencies & Execution Order

- Phase order: Setup → Foundational → US1 (P1) → US2 (P2) → US3 (P3) → Polish
- User stories can start only after Foundational; US1 should complete before US2/US3 to validate core workflow

## Parallel Opportunities

- Setup: T003/T004/T005 can run in parallel with T002 after T001 login.
- Foundational: T007–T010 can run in parallel once T006 binding decisions are recorded.
- US1: T012/T014/T018 can proceed in parallel; T016 depends on API availability; tests (T019/T020) can run in parallel after endpoints exist.
- US2: T021/T022/T024 can run in parallel; T025 after client available; T026 after handler exists.
- US3: T027/T028/T029 in parallel; T030 after error surfaces available; T031 after endpoints ready.

## Implementation Strategy

- MVP first: Deliver US1 end-to-end before expanding.
- Incremental: After US1 validation, add US2 role chat, then US3 resilience.
- Always keep secrets server-side; use `wrangler secret put GEMINI_API_KEY` and avoid client leakage.

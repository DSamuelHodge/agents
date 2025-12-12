# Feature Specification: Digital Twin MVP integration

**Feature Branch**: `[digital-twin-mvp]`  
**Created**: 2025-12-11  
**Status**: Draft  
**Input**: User description: "Integrate the 9-agent Digital Twin MVP (Workers + Gemini) into the existing React/Vite app and expose usable endpoints/UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run full workflow (Priority: P1)

As a product owner, I want to submit a feature request and get the 9-agent workflow outputs so I can review specs, architecture, code stubs, tests, and docs in one response.

**Why this priority**: Core value of the Digital Twin; all other stories depend on the workflow path working end-to-end.

**Independent Test**: From the UI, submit a feature request and verify the response shows ordered agent outputs (PM → Architect → Database → Backend → Frontend → DevOps → QA → Tech Writer) with statuses and text payloads.

**Acceptance Scenarios**:
1. **Given** a valid feature request, **When** I click "Start Development", **Then** the system runs all 9 agents sequentially and shows per-agent status/output.
2. **Given** a long-running workflow, **When** an agent finishes, **Then** the UI reflects status transitions without requiring a page reload.

---

### User Story 2 - Role-scoped chat (Priority: P2)

As a developer, I want to call a specific agent (e.g., backend) with context so I can iterate on one role without rerunning the full workflow.

**Why this priority**: Enables focused debugging and partial reruns; reduces cost/latency compared to full workflow.

**Independent Test**: POST to `/agent/backend/chat` with context and verify a structured response is returned and rendered in the UI.

**Acceptance Scenarios**:
1. **Given** role context (prior outputs), **When** I call `/agent/:role/chat`, **Then** the agent responds with role-appropriate content using Gemini.
2. **Given** an invalid role ID, **When** I call the endpoint, **Then** I receive a 400 error with a clear message.

---

### User Story 3 - Status & resilience (Priority: P3)

As a user, I want to see workflow status and recover from transient failures so I can trust the system under real conditions.

**Why this priority**: Reliability and observability reduce debugging time and improve UX.

**Independent Test**: Start a workflow, interrupt a step (simulate Gemini error), and verify status shows failure with retry guidance; `/status` returns healthy when services are up.

**Acceptance Scenarios**:
1. **Given** the Worker is healthy, **When** I call `/status`, **Then** I receive `{ ok: true, services: [...] }`.
2. **Given** a Gemini error during a workflow step, **When** the step fails, **Then** the system records the failure, returns a 500/502 with details, and the UI surfaces the error state.

---

### Edge Cases

- What happens when the `GEMINI_API_KEY` secret is missing in the Worker environment?
- How does the system handle requests that exceed length limits (very large featureRequest)?
- How are concurrent workflows isolated so outputs do not leak between runs?
- How are network/LLM timeouts surfaced to the caller?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose `POST /workflow` that runs the 9-agent sequence using Gemini and returns structured per-agent outputs and statuses.
- **FR-002**: System MUST expose `POST /agent/:role/init` and `POST /agent/:role/chat` for role-scoped actions with validation on role IDs.
- **FR-003**: System MUST maintain per-workflow context (featureRequest, prior outputs, step statuses) using Durable Object or KV/D1 backing; in-memory allowed for local dev.
- **FR-004**: System MUST surface errors with HTTP status codes and JSON error bodies suitable for UI display.
- **FR-005**: Frontend MUST call the Worker API instead of local simulation and render live status/output updates for each step.
- **FR-006**: System MUST protect secrets; Gemini key is injected via `wrangler secret put` and never embedded in client bundles.
- **FR-007**: System MUST provide a health endpoint `GET /status` reporting readiness (Gemini configured, storage bindings present).
- **FR-008**: System SHOULD support basic retry/backoff for transient LLM or network failures per step.

### Key Entities *(include if feature involves data)*

- **WorkflowRun**: Represents a submitted feature request; attributes include `id`, `featureRequest`, `status`, `steps[]`, `createdAt`, `updatedAt`.
- **AgentStep**: Represents one agent action; attributes include `roleId`, `status`, `input`, `output`, `error`, `startedAt`, `finishedAt`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: End-to-end `/workflow` call completes in <= 60 seconds for standard requests (local dev with Gemini free tier) or returns a clear timeout error.
- **SC-002**: Frontend displays per-agent status updates within 2 seconds of Worker responses for each step.
- **SC-003**: Error paths return JSON bodies with `message` and `details` fields in 100% of failure cases during testing.
- **SC-004**: Secrets are only present in Worker runtime (0 occurrences in built client assets as verified by grep/build audit).

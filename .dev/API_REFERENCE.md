# API Reference - Digital Twin MVP

## Worker Endpoints

All endpoints are served from the Cloudflare Worker at `https://<worker-url>` (local: `http://127.0.0.1:8787`).

### GET `/status`

**Health check endpoint.**

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "ok": true,
    "services": {
      "worker": "healthy",
      "durableObject": true,
      "gemini": true
    }
  }
}
```

**Error (500 Internal Server Error):**
```json
{
  "ok": false,
  "message": "Service unavailable",
  "details": "Durable Object binding missing or unreachable",
  "code": "SERVICE_UNAVAILABLE"
}
```

---

### POST `/workflow`

**Run the 9-agent workflow sequence.**

**Request:**
```json
{
  "featureRequest": "Build a todo list app with add, delete, and mark complete functionality"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "id": "wf-abc123",
    "featureRequest": "Build a todo list app...",
    "status": "completed",
    "steps": [
      {
        "roleId": "project_mgr",
        "status": "completed",
        "input": "Build a todo list app...",
        "output": "Task breakdown: 1. Create DB schema 2. Build API 3. Develop UI...",
        "startedAt": "2025-12-11T18:00:00Z",
        "finishedAt": "2025-12-11T18:00:10Z"
      },
      {
        "roleId": "pm",
        "status": "completed",
        "input": "Context from project manager...",
        "output": "Feature specification with acceptance criteria...",
        "startedAt": "2025-12-11T18:00:10Z",
        "finishedAt": "2025-12-11T18:00:20Z"
      }
      // ... 7 more agents
    ],
    "createdAt": "2025-12-11T18:00:00Z",
    "updatedAt": "2025-12-11T18:01:30Z"
  },
  "metadata": {
    "duration": 90000,
    "truncated": false
  }
}
```

**Error Responses:**

- **400 Bad Request** - Missing or invalid featureRequest:
```json
{
  "ok": false,
  "message": "Invalid input",
  "details": "featureRequest is required and must be a non-empty string",
  "code": "INVALID_INPUT"
}
```

- **413 Request Entity Too Large** - Request exceeds 256 KB:
```json
{
  "ok": false,
  "message": "Request entity too large",
  "details": "Request body exceeds 256 KB limit. Please shorten your feature request.",
  "code": "REQUEST_TOO_LARGE"
}
```

- **503 Service Unavailable** - Gemini API overloaded (after 3 retries):
```json
{
  "ok": false,
  "message": "Gemini API unavailable after 3 retries",
  "details": "HTTP 503: The model is overloaded. Please try again later.",
  "code": "GEMINI_UNAVAILABLE"
}
```

---

### POST `/agent/:roleId/chat`

**Call a single agent with context (role-scoped chat).**

**Request:**
```json
{
  "message": "Given the API endpoints, design the React components",
  "context": {
    "featureRequest": "Build a todo list app",
    "pm": "Feature spec with API endpoints...",
    "backend": "REST API endpoints: GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id"
  }
}
```

**Valid roleId values:**
- `project_mgr` - Project Manager
- `pm` - Product Manager
- `architect` - Software Architect
- `database` - Database Engineer
- `backend` - Backend Engineer
- `frontend` - Frontend Engineer
- `devops` - DevOps Engineer
- `qa` - QA Engineer
- `tech_writer` - Technical Writer

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "roleId": "frontend",
    "output": "React components: TodoList, TodoItem, AddTodoForm, DeleteButton, CompleteCheckbox...",
    "role": {
      "id": "frontend",
      "name": "Frontend Engineer",
      "tier": "development",
      "description": "Build user interfaces and client-side features"
    }
  }
}
```

**Error Responses:**

- **400 Bad Request** - Invalid roleId:
```json
{
  "ok": false,
  "message": "Invalid role",
  "details": "Role 'invalid_role' not found. Valid roles: project_mgr, pm, architect, database, backend, frontend, devops, qa, tech_writer",
  "code": "INVALID_ROLE"
}
```

- **400 Bad Request** - Missing required message:
```json
{
  "ok": false,
  "message": "Missing required field: message",
  "details": "POST /agent/:roleId/chat requires {message: string, context?: object}",
  "code": "MISSING_FIELD"
}
```

---

## Frontend API Client

Located in `src/services/api.ts`. Usage:

```typescript
import { apiClient } from '@/services/api';

// Check worker health
const status = await apiClient.getStatus();
console.log(status.ok); // true if worker is ready

// Run full workflow
const workflow = await apiClient.runWorkflow('Build a todo app');
console.log(workflow.steps[0].output); // First agent output

// Chat with specific agent
const chat = await apiClient.agentChat('backend', 'Implement API', {
  featureRequest: 'Build a todo app'
});
console.log(chat.output); // Backend response
```

---

## Error Handling

All error responses follow a consistent format:

```json
{
  "ok": false,
  "message": "Short error message",
  "details": "Detailed explanation for debugging/UI display",
  "code": "ERROR_CODE"
}
```

**Common Error Codes:**
- `INVALID_INPUT` - Input validation failed
- `MISSING_FIELD` - Required field is missing
- `INVALID_ROLE` - Role ID not recognized
- `REQUEST_TOO_LARGE` - Request body exceeds 256 KB
- `GEMINI_UNAVAILABLE` - Gemini API unavailable (after retries)
- `TIMEOUT` - Operation exceeded time limit
- `INTERNAL_ERROR` - Unexpected server error

---

## Rate Limits & Constraints

- **Request size:** Max 256 KB (returns 413 with guidance if exceeded)
- **Feature request length:** Max 8000 chars (longer inputs are summarized)
- **Gemini token budget:** ~32k tokens per workflow (context + model limit)
- **Retry policy:** 3 attempts with exponential backoff (2s, 4s, 8s delays)
- **Timeout:** 60s per workflow execution
- **Free tier limits:** Gemini 15 req/min, Cloudflare Workers 100k req/day

---

## Authentication & Security

- **Secrets:** `GEMINI_API_KEY` stored server-side via `wrangler secret put`
- **Client bundles:** No secrets included in frontend JavaScript
- **Environment variables:** Use `.env` for local dev (never commit)
- **CORS:** Worker handles requests from same origin (local) or configured frontend URL

---

## Development Integration

### Local Testing

```bash
# Terminal 1: Start worker
cd worker
wrangler dev --local

# Terminal 2: Start frontend
npm run dev

# Terminal 3: Test workflow
curl -X POST http://127.0.0.1:8787/workflow \
  -H "Content-Type: application/json" \
  -d '{"featureRequest":"Build a todo app"}'
```

### Run Tests

```bash
npm run test                  # Run all tests
npm run test -- --ui         # Open vitest UI
npm run test -- tests/worker # Run worker tests only
npm run test -- tests/frontend # Run frontend tests only
```

---

## Deployment

### To Cloudflare Workers

```bash
# Set secrets
wrangler secret put GEMINI_API_KEY

# Deploy
wrangler publish

# Verify
curl https://<your-worker>.workers.dev/status
```

### Durable Object Setup

The worker uses a Durable Object (`WorkflowCoordinator`) for per-workflow state isolation:

```toml
# wrangler.toml
[[durable_objects.bindings]]
name = "WORKFLOW_DO"
class_name = "WorkflowCoordinator"
```

---

## Examples

### Example 1: Full Workflow Execution

```bash
# Run complete 9-agent workflow
curl -X POST http://localhost:8787/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "featureRequest": "Build a note-taking app with real-time sync and markdown support"
  }'

# Response includes 9 steps (project_mgr → pm → architect → ... → tech_writer)
# Each step has status, input, output, timing
```

### Example 2: Role-Specific Chat

```bash
# Ask backend engineer for API design advice
curl -X POST http://localhost:8787/agent/backend/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Design the API endpoints for user authentication",
    "context": {
      "featureRequest": "Build a note-taking app",
      "pm": "Feature spec: Users can create, edit, share notes..."
    }
  }'
```

### Example 3: Frontend Integration

```typescript
// In React component
const [workflow, setWorkflow] = useState<WorkflowRun | null>(null);
const [error, setError] = useState<string | null>(null);

const handleStartWorkflow = async (featureRequest: string) => {
  try {
    const result = await apiClient.runWorkflow(featureRequest);
    setWorkflow(result);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  }
};

// Render workflow steps with progressive updates
{workflow?.steps.map((step, idx) => (
  <div key={idx} className={step.status === 'failed' ? 'border-red-500' : ''}>
    <h3>{step.roleId}: {step.status}</h3>
    {step.output && <pre>{step.output}</pre>}
    {step.error && <p className="text-red-600">{step.error}</p>}
  </div>
))}
```


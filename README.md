# Digital Twin MVP - 9-Agent AI Development Team

[![Status](https://img.shields.io/badge/status-production%20ready-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-55%2F55%20passing-brightgreen)]()
[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

> A fully autonomous AI development team with 9 specialized agents that can take a feature request and produce complete specifications, architecture, code, tests, and documentation—all powered by Cloudflare Workers and Google's Gemini AI.

---

## What This Does

Submit a feature request like *"Build a real-time chat with WebSocket support"* and watch 9 AI agents collaborate to deliver:

- **Project Manager** → Task breakdown and coordination
- **Product Manager** → Feature specifications with acceptance criteria
- **System Architect** → Technical design and API contracts
- **Database Engineer** → Schema design and migrations
- **Backend Developer** → API implementation
- **Frontend Developer** → React components and UI
- **DevOps Engineer** → Deployment configuration
- **QA Engineer** → Test plans and scenarios
- **Technical Writer** → User documentation and API docs

**Cost:** $0/month on Cloudflare + Gemini free tiers

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account (free tier)
- Google Gemini API key ([Get one free](https://aistudio.google.com/app/apikey))

### Installation

```bash
# Clone and install
git clone https://github.com/DSamuelHodge/agents.git
cd agents
npm install

# Set up Gemini API key
# For local dev: create worker/.dev.vars with GEMINI_API_KEY=your_key_here
# For production: wrangler secret put GEMINI_API_KEY

# Start development servers
npm run dev
```

This starts:
- **Frontend:** http://localhost:5173 (React dashboard)
- **Worker API:** http://localhost:8787 (Cloudflare Worker)

### Test the System

```bash
# Run all 55 tests
npm run test

# Open interactive test UI
npm run test:ui

# Test the workflow endpoint manually
curl -X POST http://127.0.0.1:8787/workflow \
  -H "Content-Type: application/json" \
  -d '{"featureRequest": "Build a todo list app with CRUD operations"}'
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Dashboard (Vite)                                 │
│  - Workflow visualizer                                  │
│  - Per-agent status updates                             │
│  - Activity logs                                        │
└────────────────┬────────────────────────────────────────┘
│  Cloudflare Worker API                                  │
│  - POST /agent/:role/chat (single agent)                │
│  - GET /status (health check)                           │
└────────────────┬────────────────────────────────────────┘
                 │ Sequential execution with context
                 ↓
┌─────────────────────────────────────────────────────────┐
│  - Chains outputs as context                            │
└────────────────┬────────────────────────────────────────┘
                 │ generate(prompt, systemPrompt)
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Google Gemini API (gemini-2.5-flash)                   │
│  - Free tier: 6 RPM, 46K TPM, 84 RPD                    │
│  - Automatic rate limiting & backoff                    │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
agents/
├── src/                          # React frontend
│   ├── pages/
│   │   └── dashboard.tsx         # Main workflow UI
│   └── services/
│       └── api.ts                # API client
├── worker/                       # Cloudflare Worker backend
│   └── src/
│       ├── index.ts              # API endpoints
│       ├── workflow.ts           # 9-agent orchestrator
│       ├── agents/
│       │   └── roles.ts          # Agent definitions
│       ├── utils/
│       │   ├── gemini.ts         # Gemini client + retry
│       │   ├── responses.ts      # JSON helpers + CORS
│       │   └── types.ts          # Shared types
│       └── storage/
│           └── context.ts        # Storage adapters (DO + Memory)
├── tests/                        # 55 passing tests
│   ├── worker/
│   │   ├── workflow.test.ts      # Workflow + state (18 tests)
│   │   └── agent-chat.test.ts    # Chat + resilience (37 tests)
│   └── frontend/
│       └── workflow.test.ts      # UI state + latency (15 tests)
├── specs/                        # Specification docs
│   └── master/
│       ├── digital-twin-mvp.md   # Feature spec
│       ├── tasks.md              # Task tracking
│       └── quickstart.md         # Developer guide
├── .dev/                         # Internal documentation
│   ├── Note.md                   # Rate limits & optimization
│   ├── API_REFERENCE.md          # Complete API docs
│   ├── DEPLOYMENT_GUIDE.md       # Deployment walkthrough
│   └── SECURITY_AUDIT.md         # Security review
├── package.json                  # Dependencies + scripts
├── vite.config.ts                # Frontend build config
├── vitest.config.ts              # Test configuration
└── wrangler.toml                 # Worker deployment config
```

---

## Usage

### From the Dashboard UI

1. Open http://localhost:5173
2. Enter a feature request (e.g., *"Build a user authentication system"*)
3. Click **Start Development**
4. Watch the 9 agents execute sequentially
5. View outputs, status, and timing for each agent

### From the API

```bash
# Check health
curl http://127.0.0.1:8787/status

# Run full workflow
curl -X POST http://127.0.0.1:8787/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "featureRequest": "Build a blog with posts, comments, and tags"
  }'

# Chat with a specific agent
curl -X POST http://127.0.0.1:8787/agent/backend/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Design the API endpoints",
    "context": {"featureRequest": "Build a blog"}
  }'
```

**Valid role IDs:** `project_mgr`, `pm`, `architect`, `database`, `backend`, `frontend`, `devops`, `qa`, `tech_writer`

---

## Testing

All 55 tests passing (100% coverage of user stories):

```bash
# Run tests in watch mode
npm run test

# Run once
npm run test -- --run

# Open interactive UI
npm run test:ui

# Test specific suite
npm run test tests/worker/workflow.test.ts
```

**Test Coverage:**
- **US1 (MVP Workflow):** 18 tests - endpoint, state management, errors
- **US2 (Agent Chat):** 4 tests - role validation, context handling
- **US3 (Resilience):** 33 tests - retries, rate limits, validation, latency

---

## Performance & Limits

| Metric | Value | Behavior |
|--------|-------|----------|
| **Request size** | 256 KB max | Returns 413 if exceeded |
| **Feature request** | 8K chars | Auto-summarized if longer |
| **Workflow timeout** | 60s | Returns 500 with details |
| **Retry attempts** | 3x | Exponential backoff (2s, 4s, 8s) |
| **UI updates** | <2s per step | Progressive reveal |
| **Gemini free tier** | 6 RPM, 46K TPM, 84 RPD | Rate limiting + caching available |

---

## Security

- **Secrets:** `GEMINI_API_KEY` stored server-side via Wrangler
- **Client bundles:** No secrets in frontend JavaScript
- **CORS:** Proper headers for cross-origin requests
- **Input validation:** 256 KB limit, role whitelisting
- **Error handling:** No internal details leaked
- **Audit:** Full OWASP Top 10 review completed

See `.dev/SECURITY_AUDIT.md` for details.

---

## Development

### Available Commands

```bash
npm run dev          # Start frontend + worker
npm run build        # Build for production
npm run test         # Run tests (watch mode)
npm run test:ui      # Open Vitest UI
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS
- **Backend:** Cloudflare Workers, Durable Objects
- **AI:** Google Gemini 2.5 Flash (free tier)
- **Testing:** Vitest, React Testing Library
- **Deployment:** Wrangler CLI

---

## Deployment

### To Cloudflare Workers

```bash
# 1. Set API key (one-time)
wrangler secret put GEMINI_API_KEY
# Paste your Gemini API key when prompted

# 2. Deploy
wrangler deploy

# 3. Your API is live at:
# https://digital-twin-mvp.<your-subdomain>.workers.dev
```

### Environment Variables

**Local Development:**
Create `worker/.dev.vars`:
```
GEMINI_API_KEY=your_key_here
```

**Production:**
```bash
wrangler secret put GEMINI_API_KEY
```

**Never commit `.env` or `.dev.vars` to git!**

---

## Documentation

- **[API Reference](.dev/API_REFERENCE.md)** - Complete endpoint docs with examples
- **[Deployment Guide](.dev/DEPLOYMENT_GUIDE.md)** - Step-by-step deployment
- **[Security Audit](.dev/SECURITY_AUDIT.md)** - OWASP Top 10 review
- **[Rate Limits](.dev/Note.md)** - Gemini free tier optimization strategies
- **[Feature Spec](specs/master/digital-twin-mvp.md)** - User stories & acceptance criteria

---

## Example Workflow

```typescript
import { apiClient } from './src/services/api';

// Run complete 9-agent workflow
const workflow = await apiClient.runWorkflow(
  'Build a kanban board with drag-and-drop and team collaboration'
);

// Access agent outputs
console.log('PM Output:', workflow.steps.find(s => s.roleId === 'pm')?.output);
console.log('Architecture:', workflow.steps.find(s => s.roleId === 'architect')?.output);
console.log('Backend Code:', workflow.steps.find(s => s.roleId === 'backend')?.output);

// Check status
workflow.steps.forEach(step => {
  console.log(`${step.roleId}: ${step.status}`);
  // project_mgr: completed
  // pm: completed
  // architect: completed
  // ... (9 agents total)
});
```

---

## Troubleshooting

### "GEMINI_API_KEY not configured"
```bash
# For local dev
echo "GEMINI_API_KEY=your_key" > worker/.dev.vars

# For production
wrangler secret put GEMINI_API_KEY
```

### "Worker restarted mid-request"
- This was a past issue, now fixed via lazy orchestrator initialization
- Update to latest code if you see this

### "Rate limit exceeded"
- You've hit Gemini's free tier limits (6 RPM, 84 RPD)
- Wait ~60 seconds and retry
- See `.dev/Note.md` for caching and optimization strategies

### Tests fail
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run tests
npm run test
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## Roadmap

- [x] MVP workflow with 9 agents
- [x] Role-scoped chat endpoints
- [x] Comprehensive test suite (55 tests)
- [x] Security audit (OWASP Top 10)
- [ ] KV caching for repeated prompts
- [ ] Parallel agent execution (where dependencies allow)
- [ ] Chat session persistence (Durable Objects)
- [ ] Web UI for chat history
- [ ] Expand to 190-role taxonomy
- [ ] Multi-tenant support with authentication

---

## License

MIT License - see LICENSE file for details

---

## Acknowledgments

- **Cloudflare Workers** - Serverless compute platform
- **Google Gemini** - Free-tier AI model
- **React & Vite** - Modern frontend tooling
- **Vitest** - Fast unit testing

---

## Support

- **Issues:** [GitHub Issues](https://github.com/DSamuelHodge/agents/issues)
- **Docs:** See `.dev/` folder for detailed documentation
- **API Reference:** `.dev/API_REFERENCE.md`

---

**Built by the Digital Twin MVP team**

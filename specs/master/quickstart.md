# Quickstart - Digital Twin MVP

## Prereqs
- Node 18+; `npm install` in repo root.
- Cloudflare Wrangler installed: `npm i -g wrangler`.
- Cloudflare account_id added to `wrangler.toml` (replace `your-account-id-here`).

## Secrets
- Set Gemini key (server-side only):
  - `wrangler secret put GEMINI_API_KEY`
- Ensure no secrets in `.env` are committed; client must not bundle keys.

## Storage & Bindings
- Durable Object (authoritative context):
  - Binding: `WORKFLOW_DO`
  - Class: `WorkflowCoordinator`
- Optional persistence:
  - KV: `CACHE` (cache only)
  - D1: `DB` (snapshots/history)
  - R2: `ARTIFACTS`
  - Vectorize: `VECTORIZE`
- Update IDs in `wrangler.toml` if you provision KV/D1/R2/Vectorize.

## Develop
- Worker dev: `wrangler dev --local` (uses `worker/src/index.ts` entry)
- Frontend dev: `npm run dev` (Vite SPA)

## Deploy
- `wrangler publish` (uses `wrangler.toml` bindings)

## Validation
- Health: `curl -s https://<worker>/status`
- Workflow: `curl -s -X POST https://<worker>/workflow -d '{"featureRequest":"Build X"}'`
- Role chat: `curl -s -X POST https://<worker>/agent/backend/chat -d '{"message":"Implement API"}'`

## Testing
- Unit tests: `npm run test` (vitest frontend + worker logic tests)
- UI tests: `npm run test:ui` (vitest UI dashboard)
- Integration: Manual test via `wrangler dev --local` + `npm run dev`
  - Open http://localhost:5173 (frontend)
  - Worker API at http://127.0.0.1:8787
  - Submit feature request and watch workflow execute

## Limits
- Request body max 256 KB → returns 413 with guidance.
- Feature request >8k chars → summarized before LLM call.
- Gemini input capped ~32k tokens; responses may be truncated.

# Gemini Free Tier Rate Limits & Resilience Plan

## Plan
- Add lightweight rate limiting and backoff in the Worker.
- Cache repeated prompts in KV to avoid unnecessary calls.
- Reduce and batch model calls within the 9-agent workflow.
- Provide fallback model options and progressive degradation.

## Rate Limit Controls
- **Concurrency cap:** Limit concurrent workflow executions to avoid bursts (e.g., 1–2 in free tier).
- **Backoff & jitter:** Exponential backoff with small random jitter (100–300 ms) for retryable errors.
- **Guardrails:** Track attempts per minute; pause new requests when approaching RPM.

## Caching
- **KV cache (existing `CACHE` binding):** Store outputs keyed by `model + systemPrompt + prompt`.
- **TTL:** 24h for workflow agent outputs; 10–60 minutes for ad-hoc chats.
- **Hit check:** Return cached output before calling Gemini; write-through on success.

## Workflow Optimizations
- **Step reduction:** Merge or skip roles when prior outputs are sufficiently detailed (e.g., combine PM + Architect for simple features).
- **Serialization/pacing:** Run agents sequentially under tight RPM; insert 250–500 ms sleeps.
- **Context trimming:** Pass only relevant excerpts; keep outputs short with summarization.
- **Parallelism (conditional):** Enable parallel Frontend/Backend/Database only when RPM allows.

## Fallbacks
- **Model switch:** Use `gemini-1.5-flash` for simple tasks when hitting limits.
- **Graceful partials:** Return partially completed workflow with retry-after guidance instead of failing the whole run.
- **Degradation:** Provide outlines/specs instead of full code when over quota.

## User Controls
- **Economy mode:** Env toggle (e.g., `ECONOMY_MODE=true`) to reduce steps and pacing.
- **UI slider:** "Speed vs cost" maps to concurrency and step selection.
- **Queueing:** Offer queued execution when over RPM (simple in-memory or KV-backed queue).

## Operational Tips
- **Gentle pacing:** Insert ~1s delay between agent calls in free tier.
- **Clear errors:** Detect 429/503; respond with JSON including suggested wait time.
- **Monitoring:** Log RPM/TPM/RPD counters; display in `/status`.
- **Secrets:** Keep `GEMINI_API_KEY` in Wrangler secrets or `.dev.vars`.

## Current Limits (gemini-2.5-flash, free tier)
- **RPM:** ~6
- **TPM:** ~46K
- **RPD:** ~84

These strategies help maintain reliability under free-tier quotas without unnecessary spend.
import { WorkflowOrchestrator } from './workflow';
import { AIGatewayClient } from './ai-gateway/client';
import { getRoleById } from './agents/roles';
import { jsonSuccess, jsonError, validateRequestSize, summarizeIfNeeded, preflightResponse } from './utils/responses';
import type { WorkflowRequest, AgentChatRequest, WorkflowRun } from './utils/types';
import { ArtifactManager } from './artifacts/manager';
import { GitHubClient } from './utils/github';
import { DeploymentManager } from './deploy/manager';
import { DurableObjectAuditStore, DurableObjectAuditClient } from './audit';
import type { AuditEventType } from './audit';
import type { DurableObjectState, D1Database } from '@cloudflare/workers-types';

type WorkerEnv = Record<string, unknown>;

type StoredAppSettings = {
  githubOwner?: string;
  githubRepo?: string;
  autoMerge?: boolean;
  requiredApprovals?: number;
  requiredReviewers?: string[];
  deploymentEnvironment?: string;
  updatedAt?: string;
};

type EffectiveAppSettings = {
  github: { owner: string; repo: string };
  autoMerge: boolean;
  requiredApprovals: number;
  requiredReviewers: string[];
  deploymentEnvironment: string;
  updatedAt?: string;
};

const APP_SETTINGS_DO_NAME = 'app-settings';

function normalizeStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    const items = input
      .map(v => String(v ?? '').trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  if (typeof input === 'string') {
    return normalizeStringList(
      input
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  }

  return [];
}

function toPositiveInt(value: unknown, fallback: number, max: number = 50): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded <= 0) return fallback;
  return Math.min(rounded, max);
}

function buildEffectiveSettings(env: WorkerEnv, stored?: StoredAppSettings | null): EffectiveAppSettings {
  const githubOwnerEnv = String(env.GITHUB_OWNER ?? 'DSamuelHodge').trim() || 'DSamuelHodge';
  const githubRepoEnv = String(env.GITHUB_REPO ?? 'generated-projects').trim() || 'generated-projects';

  const requiredApprovalsRaw = String(
    env.BRANCH_PROTECTION_REQUIRED_APPROVALS ?? env.DEPLOY_REQUIRED_APPROVALS ?? ''
  ).trim();
  const requiredApprovalsEnv = requiredApprovalsRaw ? toPositiveInt(requiredApprovalsRaw, 1, 50) : 1;

  const effectiveOwner = String(stored?.githubOwner ?? '').trim() || githubOwnerEnv;
  const effectiveRepo = String(stored?.githubRepo ?? '').trim() || githubRepoEnv;

  const deploymentEnvironmentEnv = String(env.ENVIRONMENT ?? 'production').trim() || 'production';
  const deploymentEnvironment =
    String(stored?.deploymentEnvironment ?? '').trim() || deploymentEnvironmentEnv;

  return {
    github: { owner: effectiveOwner, repo: effectiveRepo },
    autoMerge: Boolean(stored?.autoMerge ?? false),
    requiredApprovals: toPositiveInt(stored?.requiredApprovals, requiredApprovalsEnv, 50),
    requiredReviewers: normalizeStringList(stored?.requiredReviewers),
    deploymentEnvironment,
    updatedAt: stored?.updatedAt
  };
}

async function loadEffectiveSettings(env: WorkerEnv): Promise<EffectiveAppSettings> {
  const defaults = buildEffectiveSettings(env, null);
  const stub = getDurableObjectStub(env, APP_SETTINGS_DO_NAME);
  if (!stub) return defaults;
  try {
    const stored = await doGetJson<StoredAppSettings>(stub, '/settings');
    return buildEffectiveSettings(env, stored);
  } catch {
    return defaults;
  }
}

function computeMissingReviewers(required: string[], approvedBy: string[]): string[] {
  if (!required.length) return [];
  const approved = new Set(approvedBy.map(u => u.toLowerCase()));
  return required.filter(r => !approved.has(r.toLowerCase()));
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDurableObjectStub(env: WorkerEnv, name: string): { fetch(request: Request): Promise<Response> } | null {
  const ns = env.WORKFLOW_DO as unknown as {
    idFromName: (n: string) => unknown;
    get: (id: unknown) => { fetch(request: Request): Promise<Response> };
  };

  if (!ns || typeof ns.idFromName !== 'function' || typeof ns.get !== 'function') return null;
  const id = ns.idFromName(name);
  return ns.get(id);
}

async function readOkJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { ok?: boolean; data?: T; message?: string };
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.message ?? `HTTP ${response.status}`));
  }
  return payload.data as T;
}

async function doPostJson<T>(
  stub: { fetch(request: Request): Promise<Response> },
  path: string,
  body: unknown
): Promise<T> {
  const resp = await stub.fetch(
    new Request(`https://do${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  return readOkJson<T>(resp);
}

async function doPutJson<T>(
  stub: { fetch(request: Request): Promise<Response> },
  path: string,
  body: unknown
): Promise<T> {
  const resp = await stub.fetch(
    new Request(`https://do${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  return readOkJson<T>(resp);
}

async function doGetJson<T>(
  stub: { fetch(request: Request): Promise<Response> },
  path: string
): Promise<T> {
  const resp = await stub.fetch(new Request(`https://do${path}`, { method: 'GET' }));
  return readOkJson<T>(resp);
}

async function persistWorkflowForHistory(env: WorkerEnv, workflow: WorkflowRun): Promise<void> {
  const workflowStub = getDurableObjectStub(env, workflow.id);
  const indexStub = getDurableObjectStub(env, 'workflow-index');
  if (!workflowStub || !indexStub) return;

  try {
    await doPostJson(workflowStub, '/workflow', { workflow });
  } catch {
    // best-effort
  }

  try {
    await doPostJson(indexStub, '/index/upsert', { workflow });
  } catch {
    // best-effort
  }
}

const AUDIT_EVENT_TYPES: ReadonlySet<AuditEventType> = new Set<AuditEventType>([
  'workflow.started',
  'workflow.completed',
  'workflow.failed',
  'step.started',
  'step.completed',
  'step.failed',
  'quality.completed',
  'artifacts.publish.started',
  'artifacts.publish.completed',
  'artifacts.publish.failed',
  'deploy.trigger.requested',
  'deploy.trigger.rejected',
  'deploy.trigger.dispatched',
  'deploy.status.checked',
  'deploy.webhook.notified',
  'deploy.webhook.rollback'
]);

function isAuditEventType(value: string): value is AuditEventType {
  return AUDIT_EVENT_TYPES.has(value as AuditEventType);
}

// Durable Object for workflow coordination
export class WorkflowCoordinator {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const store = new DurableObjectAuditStore(this.state);

    // --- Workflow history persistence (E4-T002) ---
    // POST /workflow { workflow: WorkflowRun }
    if (path === '/workflow' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { workflow?: unknown };
        const workflow = body?.workflow as { id?: unknown } | undefined;
        const workflowId = String(workflow?.id ?? '').trim();
        if (!workflowId) {
          return Response.json({ ok: false, message: 'workflow.id is required' }, { status: 400 });
        }

        await this.state.storage.put('workflow', JSON.stringify(body.workflow));
        return Response.json({ ok: true, data: { saved: true, id: workflowId } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    // GET /workflow
    if (path === '/workflow' && request.method === 'GET') {
      try {
        const data = await this.state.storage.get('workflow');
        if (!data) {
          return Response.json({ ok: false, message: 'workflow not found' }, { status: 404 });
        }
        return Response.json({ ok: true, data: JSON.parse(String(data)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    type WorkflowIndexItem = {
      id: string;
      featureRequest: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      artifactUrl?: string;
      prNumber?: number;
      branch?: string;
      qualityGatePassed?: boolean;
      qualityScore?: number;
    };

    // POST /index/upsert { workflow: WorkflowRun }
    if (path === '/index/upsert' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { workflow?: unknown };
        const workflow = body?.workflow as Record<string, unknown> | undefined;
        const id = String(workflow?.id ?? '').trim();
        if (!id) {
          return Response.json({ ok: false, message: 'workflow.id is required' }, { status: 400 });
        }

        const existingRaw = await this.state.storage.get('index');
        const existing: WorkflowIndexItem[] = existingRaw ? JSON.parse(String(existingRaw)) : [];

        const item: WorkflowIndexItem = {
          id,
          featureRequest: String(workflow?.featureRequest ?? ''),
          status: String(workflow?.status ?? 'unknown'),
          createdAt: String(workflow?.createdAt ?? new Date().toISOString()),
          updatedAt: String(workflow?.updatedAt ?? new Date().toISOString()),
          artifactUrl: workflow?.artifactUrl ? String(workflow.artifactUrl) : undefined,
          prNumber:
            typeof workflow?.prNumber === 'number'
              ? (workflow.prNumber as number)
              : undefined,
          branch: workflow?.branch ? String(workflow.branch) : undefined,
          qualityGatePassed:
            typeof workflow?.qualityGatePassed === 'boolean'
              ? (workflow.qualityGatePassed as boolean)
              : undefined,
          qualityScore:
            typeof (workflow?.quality as Record<string, unknown> | undefined)?.score === 'number'
              ? ((workflow?.quality as Record<string, unknown>).score as number)
              : undefined
        };

        const filtered = existing.filter(x => x.id !== id);
        const next = [item, ...filtered]
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .slice(0, 200);

        await this.state.storage.put('index', JSON.stringify(next));
        return Response.json({ ok: true, data: { upserted: true, id } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    // GET /index/list?limit=50
    if (path === '/index/list' && request.method === 'GET') {
      try {
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Number(limitParam) : 50;
        const capped = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

        const existingRaw = await this.state.storage.get('index');
        const existing: WorkflowIndexItem[] = existingRaw ? JSON.parse(String(existingRaw)) : [];
        return Response.json({ ok: true, data: { items: existing.slice(0, capped) } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    // --- App settings persistence (E4-T004) ---
    // GET /settings
    if (path === '/settings' && request.method === 'GET') {
      try {
        const raw = await this.state.storage.get('settings');
        const data = raw ? (JSON.parse(String(raw)) as StoredAppSettings) : null;
        return Response.json({ ok: true, data: data ?? {} });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    // PUT /settings
    if (path === '/settings' && (request.method === 'PUT' || request.method === 'POST')) {
      try {
        const body = (await request.json()) as Record<string, unknown>;

        const githubFromBody =
          body.github && typeof body.github === 'object' ? (body.github as Record<string, unknown>) : null;

        const githubOwner =
          typeof body.githubOwner === 'string'
            ? body.githubOwner.trim()
            : typeof githubFromBody?.owner === 'string'
              ? String(githubFromBody.owner).trim()
              : undefined;
        const githubRepo =
          typeof body.githubRepo === 'string'
            ? body.githubRepo.trim()
            : typeof githubFromBody?.repo === 'string'
              ? String(githubFromBody.repo).trim()
              : undefined;

        const next: StoredAppSettings = {
          githubOwner: githubOwner ? githubOwner : undefined,
          githubRepo: githubRepo ? githubRepo : undefined,
          autoMerge: typeof body.autoMerge === 'boolean' ? (body.autoMerge as boolean) : undefined,
          requiredApprovals:
            body.requiredApprovals === undefined
              ? undefined
              : toPositiveInt(body.requiredApprovals, 1, 50),
          requiredReviewers:
            body.requiredReviewers === undefined
              ? undefined
              : normalizeStringList(body.requiredReviewers),
          deploymentEnvironment:
            typeof body.deploymentEnvironment === 'string'
              ? body.deploymentEnvironment.trim() || undefined
              : undefined,
          updatedAt: new Date().toISOString()
        };

        // Merge with existing settings for partial updates.
        const existingRaw = await this.state.storage.get('settings');
        const existing: StoredAppSettings = existingRaw ? JSON.parse(String(existingRaw)) : {};

        const merged: StoredAppSettings = {
          ...existing,
          ...Object.fromEntries(
            Object.entries(next).filter(([, v]) => v !== undefined)
          )
        };

        await this.state.storage.put('settings', JSON.stringify(merged));
        return Response.json({ ok: true, data: merged });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    if (path === '/audit/event' && request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          auditId?: string;
          event?: { type?: string; ts?: string; data?: unknown };
        };
        const auditId = String(body?.auditId ?? '').trim();
        const type = String(body?.event?.type ?? '').trim();

        if (!auditId) {
          return Response.json({ ok: false, message: 'auditId is required' }, { status: 400 });
        }
        if (!type) {
          return Response.json({ ok: false, message: 'event.type is required' }, { status: 400 });
        }

        if (!isAuditEventType(type)) {
          return Response.json({ ok: false, message: `Unsupported audit event type: ${type}` }, { status: 400 });
        }

        const appended = await store.append(auditId, {
          type,
          ts: body.event?.ts,
          data: body.event?.data
        });

        return Response.json({ ok: true, data: appended });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    if (path === '/audit' && request.method === 'GET') {
      try {
        const auditId = String(url.searchParams.get('auditId') ?? '').trim();
        if (!auditId) {
          return Response.json({ ok: false, message: 'auditId is required' }, { status: 400 });
        }
        const events = await store.list(auditId);
        return Response.json({ ok: true, data: { auditId, events } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    return Response.json({ ok: true, service: 'workflow-coordinator', path });
  }
}

// Durable Object stub (types from Cloudflare Workers - any type acceptable here)
export type Env = Record<string, unknown>;

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return preflightResponse();
    }

    // Validate request size
    const sizeError = validateRequestSize(request);
    if (sizeError) {
      return jsonError(sizeError, 413, 'Request body exceeds 256 KB limit. Please reduce payload size.');
    }

    // Status endpoint
    if (path === '/status') {
      return jsonSuccess({
        ok: true,
        services: {
          worker: 'healthy',
          durableObject: Boolean(env.WORKFLOW_DO),
          gemini: Boolean(env.GEMINI_API_KEY)
        }
      });
    }

    // --- App settings endpoints (E4-T004) ---
    // GET /settings
    if (path === '/settings' && request.method === 'GET') {
      try {
        const stub = getDurableObjectStub(env, APP_SETTINGS_DO_NAME);
        if (!stub) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const stored = await doGetJson<StoredAppSettings>(stub, '/settings');
        return jsonSuccess(buildEffectiveSettings(env, stored));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load settings';
        return jsonError(message, 500, String(error));
      }
    }

    // PUT /settings
    if (path === '/settings' && request.method === 'PUT') {
      try {
        const stub = getDurableObjectStub(env, APP_SETTINGS_DO_NAME);
        if (!stub) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const body = (await request.json()) as Record<string, unknown>;
        const githubFromBody =
          body.github && typeof body.github === 'object' ? (body.github as Record<string, unknown>) : null;

        const normalized: Partial<StoredAppSettings> = {
          githubOwner:
            typeof body.githubOwner === 'string'
              ? body.githubOwner.trim()
              : typeof githubFromBody?.owner === 'string'
                ? String(githubFromBody.owner).trim()
                : undefined,
          githubRepo:
            typeof body.githubRepo === 'string'
              ? body.githubRepo.trim()
              : typeof githubFromBody?.repo === 'string'
                ? String(githubFromBody.repo).trim()
                : undefined,
          autoMerge: typeof body.autoMerge === 'boolean' ? (body.autoMerge as boolean) : undefined,
          requiredApprovals:
            body.requiredApprovals === undefined
              ? undefined
              : toPositiveInt(body.requiredApprovals, 1, 50),
          requiredReviewers:
            body.requiredReviewers === undefined
              ? undefined
              : normalizeStringList(body.requiredReviewers),
          deploymentEnvironment:
            typeof body.deploymentEnvironment === 'string'
              ? body.deploymentEnvironment.trim() || undefined
              : undefined
        };

        const stored = await doPutJson<StoredAppSettings>(stub, '/settings', normalized);
        return jsonSuccess(buildEffectiveSettings(env, stored));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update settings';
        return jsonError(message, 500, String(error));
      }
    }

    // --- Workflow history endpoints (E4-T002) ---
    // GET /history?limit=50&includePrStatus=true
    if (path === '/history' && request.method === 'GET') {
      try {
        const stub = getDurableObjectStub(env, 'workflow-index');
        if (!stub) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Number(limitParam) : 50;
        const capped = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
        const includePrStatus = String(url.searchParams.get('includePrStatus') ?? 'true').toLowerCase() === 'true';

        const data = await doGetJson<{ items: unknown }>(
          stub,
          `/index/list?limit=${encodeURIComponent(String(capped))}`
        );
        const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];

        if (includePrStatus && env.GITHUB_TOKEN) {
          const settings = await loadEffectiveSettings(env);
          const github = new GitHubClient({
            token: String(env.GITHUB_TOKEN),
            owner: settings.github.owner,
            repo: settings.github.repo
          });

          // Best-effort: enrich first 25 PRs to avoid rate limits.
          const enriched = await Promise.all(
            items.slice(0, 25).map(async item => {
              const prNumber = Number(item?.prNumber);
              if (!Number.isFinite(prNumber) || prNumber <= 0) return item;
              try {
                const pr = await github.getPRStatus(prNumber);
                return { ...item, pr };
              } catch {
                return item;
              }
            })
          );

          return jsonSuccess({ items: [...enriched, ...items.slice(25)] });
        }

        return jsonSuccess({ items });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'History list failed';
        return jsonError(message, 500, String(error));
      }
    }

    // GET /history/run?id=<workflowId>
    if (path === '/history/run' && request.method === 'GET') {
      try {
        const id = String(url.searchParams.get('id') ?? '').trim();
        if (!id) {
          return jsonError('id is required', 400, 'Provide ?id=<workflowId>');
        }
        const stub = getDurableObjectStub(env, id);
        if (!stub) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const workflow = await doGetJson<unknown>(stub, '/workflow');
        return jsonSuccess({ workflow });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'History lookup failed';
        const status = message.toLowerCase().includes('not found') ? 404 : 500;
        return jsonError(message, status, String(error));
      }
    }

    // GET /history/compare?a=<id>&b=<id>
    if (path === '/history/compare' && request.method === 'GET') {
      try {
        const a = String(url.searchParams.get('a') ?? '').trim();
        const b = String(url.searchParams.get('b') ?? '').trim();
        if (!a || !b) {
          return jsonError('a and b are required', 400, 'Provide ?a=<workflowId>&b=<workflowId>');
        }

        const stubA = getDurableObjectStub(env, a);
        const stubB = getDurableObjectStub(env, b);
        if (!stubA || !stubB) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const [runA, runB] = await Promise.all([
          doGetJson<Record<string, unknown>>(stubA, '/workflow'),
          doGetJson<Record<string, unknown>>(stubB, '/workflow')
        ]);

        const stepsA = Array.isArray(runA?.steps) ? (runA.steps as unknown[]) : [];
        const stepsB = Array.isArray(runB?.steps) ? (runB.steps as unknown[]) : [];

        const mapA = new Map<string, string>();
        const mapB = new Map<string, string>();

        for (const s of stepsA) {
          const step = s as Record<string, unknown>;
          const roleId = String(step?.roleId ?? '').trim();
          if (!roleId) continue;
          const out = typeof step?.output === 'string' ? (step.output as string) : '';
          mapA.set(roleId, out);
        }
        for (const s of stepsB) {
          const step = s as Record<string, unknown>;
          const roleId = String(step?.roleId ?? '').trim();
          if (!roleId) continue;
          const out = typeof step?.output === 'string' ? (step.output as string) : '';
          mapB.set(roleId, out);
        }

        const roles = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
        const diff = roles.map(roleId => {
          const outA = mapA.get(roleId) ?? '';
          const outB = mapB.get(roleId) ?? '';
          return {
            roleId,
            a: outA,
            b: outB,
            same: outA.trim() === outB.trim()
          };
        });

        return jsonSuccess({ a, b, diff });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Compare failed';
        return jsonError(message, 500, String(error));
      }
    }

    // GET /history/export?id=<workflowId>
    if (path === '/history/export' && request.method === 'GET') {
      try {
        const id = String(url.searchParams.get('id') ?? '').trim();
        if (!id) {
          return jsonError('id is required', 400, 'Provide ?id=<workflowId>');
        }

        const stub = getDurableObjectStub(env, id);
        if (!stub) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const workflow = await doGetJson<unknown>(stub, '/workflow');
        let audit: unknown;
        try {
          audit = await doGetJson<unknown>(stub, `/audit?auditId=${encodeURIComponent(id)}`);
        } catch {
          audit = undefined;
        }

        return jsonSuccess({
          exportedAt: new Date().toISOString(),
          workflow,
          audit
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        return jsonError(message, 500, String(error));
      }
    }

    // GET /audit?auditId=... (or ?workflowId=...)
    if (path === '/audit' && request.method === 'GET') {
      try {
        const auditId = String(url.searchParams.get('auditId') ?? url.searchParams.get('workflowId') ?? '').trim();
        if (!auditId) {
          return jsonError('auditId is required', 400, 'Provide ?auditId=<id> (or ?workflowId=<id>)');
        }

        const stub = getDurableObjectStub(env, auditId);
        if (!stub) {
          return jsonError('WORKFLOW_DO not configured', 500, 'Server configuration error');
        }

        const audit = new DurableObjectAuditClient(stub);
        const events = await audit.list(auditId);
        return jsonSuccess({ auditId, events });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Audit export failed';
        return jsonError(message, 500, String(error));
      }
    }

    // POST /deploy/trigger - Trigger deployment workflow for an approved PR
    if (path === '/deploy/trigger' && request.method === 'POST') {
      let prNumber = 0;

      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const body = (await request.json()) as { prNumber?: number };
        prNumber = Number(body?.prNumber);
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide a valid pull request number');
        }

        const settings = await loadEffectiveSettings(env);
        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        const workflowFile = String(env.DEPLOY_WORKFLOW_FILE ?? 'agents.yml');

        const manager = new DeploymentManager(github, {
          workflowFile,
          requiredApprovals: settings.requiredApprovals,
          environment: settings.deploymentEnvironment,
          notifyWebhookUrl: env.DEPLOY_NOTIFY_WEBHOOK_URL
            ? String(env.DEPLOY_NOTIFY_WEBHOOK_URL)
            : undefined,
          rollbackWebhookUrl: env.DEPLOY_ROLLBACK_WEBHOOK_URL
            ? String(env.DEPLOY_ROLLBACK_WEBHOOK_URL)
            : undefined
        });

        const deployAuditId = `deploy:pr:${prNumber}`;
        const deployAuditStub = getDurableObjectStub(env, deployAuditId);
        const deployAudit = deployAuditStub ? new DurableObjectAuditClient(deployAuditStub) : null;

        // Enforce required reviewers before triggering deploy.
        let approvalDetails: Array<{ user: string; submittedAt: string }> | undefined;
        try {
          approvalDetails = await github.getPRApprovalDetails(prNumber);
        } catch {
          approvalDetails = undefined;
        }

        const approvedBy = approvalDetails ? approvalDetails.map(x => x.user) : [];
        const missingReviewers = computeMissingReviewers(settings.requiredReviewers, approvedBy);
        if (missingReviewers.length > 0) {
          return jsonError(
            'PR is missing required reviewer approval(s)',
            400,
            `Missing: ${missingReviewers.join(', ')}`
          );
        }

        try {
          const prStatus = await github.getPRStatus(prNumber);
          await deployAudit?.append(deployAuditId, {
            type: 'deploy.trigger.requested',
            data: {
              prNumber,
              requiredApprovals: settings.requiredApprovals,
              approvals: prStatus.approvals,
              requiredReviewers: settings.requiredReviewers.length ? settings.requiredReviewers : undefined,
              approvalDetails: approvalDetails && approvalDetails.length > 0 ? approvalDetails : undefined
            }
          });
        } catch {
          // best-effort
        }

        const result = await manager.triggerDeploymentForPullRequest(prNumber);

        try {
          await deployAudit?.append(deployAuditId, {
            type: 'deploy.trigger.dispatched',
            data: {
              prNumber,
              branch: result.branch,
              workflowFile: result.workflowFile,
              run: result.run
            }
          });
        } catch {
          // best-effort
        }

        return jsonSuccess(result);
      } catch (error) {
        try {
          if (Number.isFinite(prNumber) && prNumber > 0) {
            const deployAuditId = `deploy:pr:${prNumber}`;
            const deployAuditStub = getDurableObjectStub(env, deployAuditId);
            const deployAudit = deployAuditStub ? new DurableObjectAuditClient(deployAuditStub) : null;
            await deployAudit?.append(deployAuditId, {
              type: 'deploy.trigger.rejected',
              data: { prNumber, error: error instanceof Error ? error.message : String(error) }
            });
          }
        } catch {
          // best-effort
        }
        const message = error instanceof Error ? error.message : 'Deploy trigger failed';
        return jsonError(message, 500, String(error));
      }
    }

    // GET /deploy/status?prNumber=123&notify=true&rollbackOnFailure=true
    if (path === '/deploy/status' && request.method === 'GET') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const prParam = url.searchParams.get('prNumber');
        const prNumber = Number(prParam);
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide ?prNumber=<number>');
        }

        const notify = String(url.searchParams.get('notify') ?? '').toLowerCase() === 'true';
        const rollbackOnFailure =
          String(url.searchParams.get('rollbackOnFailure') ?? '').toLowerCase() === 'true';

        const settings = await loadEffectiveSettings(env);
        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        const workflowFile = String(env.DEPLOY_WORKFLOW_FILE ?? 'agents.yml');
        const manager = new DeploymentManager(github, {
          workflowFile,
          notifyWebhookUrl: env.DEPLOY_NOTIFY_WEBHOOK_URL
            ? String(env.DEPLOY_NOTIFY_WEBHOOK_URL)
            : undefined,
          rollbackWebhookUrl: env.DEPLOY_ROLLBACK_WEBHOOK_URL
            ? String(env.DEPLOY_ROLLBACK_WEBHOOK_URL)
            : undefined
        });

        const result = await manager.getDeploymentStatusForPullRequest(prNumber, {
          notify,
          rollbackOnFailure
        });

        const deployAuditId = `deploy:pr:${prNumber}`;
        const deployAuditStub = getDurableObjectStub(env, deployAuditId);
        const deployAudit = deployAuditStub ? new DurableObjectAuditClient(deployAuditStub) : null;

        try {
          await deployAudit?.append(deployAuditId, {
            type: 'deploy.status.checked',
            data: {
              prNumber,
              branch: result.branch,
              workflowFile: result.workflowFile,
              run: result.run,
              notify,
              rollbackOnFailure
            }
          });

          if (result.notified) {
            await deployAudit?.append(deployAuditId, {
              type: 'deploy.webhook.notified',
              data: { prNumber, run: result.run }
            });
          }

          if (result.rolledBack) {
            await deployAudit?.append(deployAuditId, {
              type: 'deploy.webhook.rollback',
              data: { prNumber, run: result.run }
            });
          }
        } catch {
          // best-effort
        }

        return jsonSuccess(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Deploy status failed';
        return jsonError(message, 500, String(error));
      }
    }

    // --- GitHub UI endpoints (E4-T001) ---
    // GET /github/pr/status?prNumber=123
    if (path === '/github/pr/status' && request.method === 'GET') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const prNumber = Number(url.searchParams.get('prNumber'));
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide ?prNumber=<number>');
        }

        const settings = await loadEffectiveSettings(env);

        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        const status = await github.getPRStatus(prNumber);

        let approvalDetails: Array<{ user: string; submittedAt: string }> = [];
        try {
          approvalDetails = await github.getPRApprovalDetails(prNumber);
        } catch {
          approvalDetails = [];
        }

        const approvedBy = approvalDetails.map(x => x.user);
        const approvals = approvalDetails.length > 0 ? approvalDetails.length : status.approvals;
        const missingReviewers = computeMissingReviewers(settings.requiredReviewers, approvedBy);

        const label =
          status.state === 'merged'
            ? 'merged'
            : status.state === 'open' && approvals >= settings.requiredApprovals && missingReviewers.length === 0
              ? 'approved'
              : status.state;

        return jsonSuccess({
          prNumber,
          ...status,
          approvals,
          requiredApprovals: settings.requiredApprovals,
          requiredReviewers: settings.requiredReviewers,
          approvedBy,
          missingReviewers,
          label
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get PR status';
        return jsonError(message, 500, String(error));
      }
    }

    // POST /github/pr/approve { prNumber, notes? }
    if (path === '/github/pr/approve' && request.method === 'POST') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const body = (await request.json()) as { prNumber?: number; notes?: string };
        const prNumber = Number(body?.prNumber);
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide a valid prNumber');
        }

        const notes = String(body?.notes ?? '').trim();

        const settings = await loadEffectiveSettings(env);

        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        await github.approvePullRequest(prNumber, notes || undefined);

        if (settings.autoMerge) {
          try {
            await github.enableAutoMerge(prNumber, 'squash');
          } catch {
            // best-effort
          }
        }
        return jsonSuccess({ prNumber, approved: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to approve PR';
        return jsonError(message, 500, String(error));
      }
    }

    // POST /github/pr/merge { prNumber, method?, notes? }
    if (path === '/github/pr/merge' && request.method === 'POST') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const body = (await request.json()) as {
          prNumber?: number;
          method?: 'merge' | 'squash' | 'rebase';
          notes?: string;
        };

        const prNumber = Number(body?.prNumber);
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide a valid prNumber');
        }

        const method = body?.method === 'merge' || body?.method === 'rebase' || body?.method === 'squash'
          ? body.method
          : 'squash';
        const notes = String(body?.notes ?? '').trim();

        const settings = await loadEffectiveSettings(env);
        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        // Enforce approval requirements server-side.
        const status = await github.getPRStatus(prNumber);
        let approvalDetails: Array<{ user: string; submittedAt: string }> = [];
        try {
          approvalDetails = await github.getPRApprovalDetails(prNumber);
        } catch {
          approvalDetails = [];
        }

        const approvals = approvalDetails.length > 0 ? approvalDetails.length : status.approvals;
        const approvedBy = approvalDetails.map(x => x.user);
        const missingReviewers = computeMissingReviewers(settings.requiredReviewers, approvedBy);

        if (status.state !== 'open' || status.merged) {
          return jsonError('PR must be open to merge', 400, 'Only open PRs can be merged');
        }
        if (approvals < settings.requiredApprovals) {
          return jsonError(
            `PR requires ${settings.requiredApprovals} approval(s) to merge`,
            400,
            `Approvals: ${approvals}`
          );
        }
        if (missingReviewers.length > 0) {
          return jsonError(
            'PR is missing required reviewer approval(s)',
            400,
            `Missing: ${missingReviewers.join(', ')}`
          );
        }

        const result = await github.mergePullRequest(
          prNumber,
          method,
          notes ? `Approved by Digital Twin UI (PR #${prNumber})` : undefined,
          notes || undefined
        );

        return jsonSuccess({ prNumber, ...result, method });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to merge PR';
        return jsonError(message, 500, String(error));
      }
    }

    // GET /github/pr/diff?prNumber=123
    if (path === '/github/pr/diff' && request.method === 'GET') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const prNumber = Number(url.searchParams.get('prNumber'));
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide ?prNumber=<number>');
        }

        const settings = await loadEffectiveSettings(env);
        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        const files = await github.listPullRequestFiles(prNumber);
        return jsonSuccess({ prNumber, files });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get PR diff';
        return jsonError(message, 500, String(error));
      }
    }

    // GET /github/pr/review-comments?prNumber=123
    if (path === '/github/pr/review-comments' && request.method === 'GET') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const prNumber = Number(url.searchParams.get('prNumber'));
        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide ?prNumber=<number>');
        }

        const settings = await loadEffectiveSettings(env);
        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        const comments = await github.listPullRequestReviewComments(prNumber);
        return jsonSuccess({ prNumber, comments });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list PR review comments';
        return jsonError(message, 500, String(error));
      }
    }

    // POST /github/pr/review-comments { prNumber, path, line, body, side? }
    if (path === '/github/pr/review-comments' && request.method === 'POST') {
      try {
        if (!env.GITHUB_TOKEN) {
          return jsonError('GITHUB_TOKEN not configured', 500, 'Server configuration error');
        }

        const body = (await request.json()) as {
          prNumber?: number;
          path?: string;
          line?: number;
          body?: string;
          side?: 'LEFT' | 'RIGHT';
        };

        const prNumber = Number(body?.prNumber);
        const filePath = String(body?.path ?? '').trim();
        const line = Number(body?.line);
        const commentBody = String(body?.body ?? '').trim();
        const side = body?.side === 'LEFT' ? 'LEFT' : 'RIGHT';

        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return jsonError('prNumber is required', 400, 'Provide a valid prNumber');
        }
        if (!filePath) {
          return jsonError('path is required', 400, 'Provide a valid file path');
        }
        if (!Number.isFinite(line) || line <= 0) {
          return jsonError('line is required', 400, 'Provide a valid 1-based line number');
        }
        if (!commentBody) {
          return jsonError('body is required', 400, 'Provide a non-empty comment body');
        }

        const settings = await loadEffectiveSettings(env);
        const github = new GitHubClient({
          token: String(env.GITHUB_TOKEN),
          owner: settings.github.owner,
          repo: settings.github.repo
        });

        const created = await github.createPullRequestReviewComment(prNumber, {
          body: commentBody,
          path: filePath,
          line,
          side
        });

        return jsonSuccess({ prNumber, ...created });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create PR review comment';
        return jsonError(message, 500, String(error));
      }
    }

    // Check API key early for routes that require it
    const hasApiKey = Boolean(env.GEMINI_API_KEY);

    // POST /workflow - Run full 9-agent sequence
    if (path === '/workflow' && request.method === 'POST') {
      try {
        if (!hasApiKey) {
          return jsonError('GEMINI_API_KEY not configured', 500, 'Server configuration error');
        }
        const body = await request.json() as WorkflowRequest;
        
        if (!body.featureRequest || typeof body.featureRequest !== 'string') {
          return jsonError('featureRequest is required', 400, 'Provide a valid feature description');
        }

        const summarized = summarizeIfNeeded(body.featureRequest);
        const workflowId = makeId();

        const auditStub = getDurableObjectStub(env, workflowId);
        const audit = auditStub ? new DurableObjectAuditClient(auditStub) : undefined;
        // Lazily construct orchestrator inside try to avoid top-level crashes
        const hasGitHub = Boolean(env.GITHUB_TOKEN);
        let artifactManager: ArtifactManager | undefined;

        if (hasGitHub) {
          const enableBranchProtection =
            String(env.ENABLE_BRANCH_PROTECTION ?? '').toLowerCase() ===
            'true';
          const requiredChecksRaw = String(
            env.BRANCH_PROTECTION_REQUIRED_CHECKS ?? ''
          ).trim();
          const requiredChecks = requiredChecksRaw
            ? requiredChecksRaw
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : undefined;
          const requiredApprovalsRaw = String(
            env.BRANCH_PROTECTION_REQUIRED_APPROVALS ?? ''
          ).trim();
          const requiredApprovals = requiredApprovalsRaw
            ? Number(requiredApprovalsRaw)
            : undefined;

          const enforceAdminsRaw = String(
            env.BRANCH_PROTECTION_ENFORCE_ADMINS ?? ''
          ).trim();
          const dismissStaleRaw = String(
            env.BRANCH_PROTECTION_DISMISS_STALE_REVIEWS ?? ''
          ).trim();
          const requireCodeownersRaw = String(
            env.BRANCH_PROTECTION_REQUIRE_CODEOWNERS ?? ''
          ).trim();
          const enableAutoMerge =
            String(env.ENABLE_AUTO_MERGE ?? '').toLowerCase() === 'true';
          const autoMergeMethodRaw = String(
            env.AUTO_MERGE_METHOD ?? ''
          )
            .trim()
            .toLowerCase();
          const autoMergeMethod =
            autoMergeMethodRaw === 'merge' ||
            autoMergeMethodRaw === 'rebase' ||
            autoMergeMethodRaw === 'squash'
              ? autoMergeMethodRaw
              : undefined;

          artifactManager = new ArtifactManager({
            githubToken: String(env.GITHUB_TOKEN ?? ''),
            githubOwner: String(env.GITHUB_OWNER ?? 'DSamuelHodge'),
            githubRepo: String(env.GITHUB_REPO ?? 'generated-projects'),
            branchProtection: enableBranchProtection
              ? {
                  enabled: true,
                  branch: String(env.BRANCH_PROTECTION_BRANCH ?? 'main'),
                  requiredStatusChecks:
                    requiredChecks && requiredChecks.length > 0
                      ? {
                          strict:
                            String(
                              env.BRANCH_PROTECTION_STRICT ?? 'true'
                            ).toLowerCase() === 'true',
                          contexts: requiredChecks
                        }
                      : undefined,
                  requiredApprovingReviewCount:
                    requiredApprovals && Number.isFinite(requiredApprovals)
                      ? requiredApprovals
                      : undefined,
                  enforceAdmins:
                    enforceAdminsRaw
                      ? enforceAdminsRaw.toLowerCase() === 'true'
                      : undefined,
                  dismissStaleReviews:
                    dismissStaleRaw
                      ? dismissStaleRaw.toLowerCase() === 'true'
                      : undefined,
                  requireCodeOwnerReviews:
                    requireCodeownersRaw
                      ? requireCodeownersRaw.toLowerCase() === 'true'
                      : undefined
                }
              : undefined,
            autoMerge: enableAutoMerge
              ? { enabled: true, method: autoMergeMethod }
              : undefined
          });
        }

        const orchestrator = new WorkflowOrchestrator(
          new AIGatewayClient('https://gateway.ai.cloudflare.com/v1', env.D1 as D1Database),
          artifactManager,
          {
            enableFeedbackLoop:
              String(env.ENABLE_FEEDBACK_LOOP ?? '').toLowerCase() === 'true',
            auditStore: audit
          }
        );
        const workflow = await orchestrator.runWorkflow(summarized, { workflowId });

        // Best-effort persistence for history view.
        await persistWorkflowForHistory(env, workflow);

        return jsonSuccess(workflow, {
          duration: Date.now() - new Date(workflow.createdAt).getTime(),
          truncated: summarized.length < body.featureRequest.length
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Workflow execution failed';
        return jsonError(message, 500, String(error));
      }
    }

    // POST /agent/:role/chat - Single agent interaction
    if (path.startsWith('/agent/') && path.endsWith('/chat') && request.method === 'POST') {
      try {
        if (!hasApiKey) {
          return jsonError('GEMINI_API_KEY not configured', 500, 'Server configuration error');
        }
        const roleId = path.split('/')[2];
        const role = getRoleById(roleId);
        
        if (!role) {
          return jsonError(`Invalid role: ${roleId}`, 400, 'Role not found. Valid roles: pm, architect, backend, frontend, database, devops, qa, tech_writer, project_mgr');
        }

        const body = await request.json() as AgentChatRequest;
        
        if (!body.message || typeof body.message !== 'string') {
          return jsonError('message is required', 400);
        }

        // Lazily construct orchestrator inside try to avoid top-level crashes
        const orchestrator = new WorkflowOrchestrator(new AIGatewayClient('https://gateway.ai.cloudflare.com/v1', env.D1 as D1Database));
        const output = await orchestrator.runAgentChat(roleId, body.message, body.context);

        return jsonSuccess({ roleId, output, role: role.name });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent chat failed';
        return jsonError(message, 500, String(error));
      }
    }

    // 404 for unknown routes
    return jsonError('Not found', 404, `Path ${path} not recognized`);
  },
};

import type { WorkflowEnv } from './agents/workflow-agent';

// Export the WorkflowAgent class for Durable Object binding
// Conditionally export WorkflowAgent to avoid importing Cloudflare-specific deps during Node/Vitest tests.
const __isCloudflareRuntime = typeof (globalThis as Record<string, unknown>).WebSocketPair !== 'undefined'
  || (typeof (globalThis as Record<string, unknown>).navigator === 'object'
    && typeof (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'string'
    && ((globalThis as { navigator?: { userAgent?: string } }).navigator!.userAgent!.includes('Cloudflare-Workers')
      || (globalThis as { navigator?: { userAgent?: string } }).navigator!.userAgent!.includes('workerd')));

let WorkflowAgent: unknown;
let WorkflowAgentSql: unknown;
if (__isCloudflareRuntime) {
  const mod = await import(/* @vite-ignore */ './agents/workflow-agent');
  WorkflowAgent = mod.WorkflowAgent;
  WorkflowAgentSql = mod.WorkflowAgentSql ?? mod.WorkflowAgent;
} else {
  // Provide a harmless stub in non-Cloudflare environments
  WorkflowAgent = class WorkflowAgentStub {};
  WorkflowAgentSql = WorkflowAgent;
}

export { WorkflowAgent, WorkflowAgentSql };

// Also export the old WorkflowCoordinator for backward compatibility during migration
export { WorkflowCoordinator } from './index-legacy';

/**
 * Main Worker fetch handler
 * 
 * Routes requests to:
 * - Agents SDK agents (WorkflowAgent) via /agent/:name pattern
 * - Legacy HTTP endpoints for backward compatibility
 */
export default {
  async fetch(request: Request, env: WorkflowEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Health check early to avoid false negatives from agent routing
    if (path === '/' || path === '/status') {
      if (path === '/') {
        return Response.redirect(url.origin + '/status', 302);
      }
      return Response.json({
        ok: true,
        services: {
          worker: 'healthy',
          agentSDK: Boolean(env.WORKFLOW_AGENT),
          gemini: Boolean(env.GEMINI_API_KEY),
          github: Boolean(env.GITHUB_TOKEN)
        },
        migration: {
          status: 'in-progress',
          agentSDKEnabled: true,
          legacyEndpointsDeprecated: false
        }
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        }
      });
    }

    // Try to route to Agents SDK first
    // Pattern: /:agent/:name or /workflow-agent/:instance-id
    // Avoid top-level import to prevent Node/Vitest from resolving Cloudflare-specific protocols.
    // The dynamic import is ignored by Vite pre-bundling to keep it runtime-only.
    // Only attempt import when running inside Cloudflare Workers runtime
    const isCloudflareRuntime = typeof (globalThis as Record<string, unknown>).WebSocketPair !== 'undefined'
      || (typeof (globalThis as Record<string, unknown>).navigator === 'object'
        && typeof (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'string'
        && ((globalThis as { navigator?: { userAgent?: string } }).navigator!.userAgent!.includes('Cloudflare-Workers')
          || (globalThis as { navigator?: { userAgent?: string } }).navigator!.userAgent!.includes('workerd')));

    if (isCloudflareRuntime) {
      try {
        const mod = await import(/* @vite-ignore */ 'agents');
        if (typeof mod.routeAgentRequest === 'function') {
          const agentResponse = await mod.routeAgentRequest(request, env as unknown as Record<string, unknown>);
          if (agentResponse) {
            return agentResponse;
          }
        }
      } catch (_) {
        // Agents SDK not available in this environment; fall through to legacy handling.
      }
    }

    // Legacy status endpoint
    if (path === '/status') {
      return Response.json({
        ok: true,
        services: {
          worker: 'healthy',
          agentSDK: Boolean(env.WORKFLOW_AGENT),
          gemini: Boolean(env.GEMINI_API_KEY),
          github: Boolean(env.GITHUB_TOKEN)
        },
        migration: {
          status: 'in-progress',
          agentSDKEnabled: true,
          legacyEndpointsDeprecated: false
        }
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        }
      });
    }

    // For now, proxy other requests to legacy endpoints
    // This allows gradual migration
    try {
      const legacyModule = await import('./index-legacy');
      if (legacyModule.default && typeof legacyModule.default.fetch === 'function') {
        return await legacyModule.default.fetch(request, env);
      }
    } catch (error) {
      console.error('Failed to load legacy module:', error);
    }

    return Response.json({
      ok: false,
      error: 'Not Found',
      message: 'Use /workflow-agent/:instance-id for Agents SDK or legacy endpoints',
      availablePatterns: [
        '/workflow-agent/:instance-id - Agent SDK WebSocket/HTTP',
        '/status - Health check',
        'Legacy endpoints - See index-legacy.ts'
      ]
    }, {
      status: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
};

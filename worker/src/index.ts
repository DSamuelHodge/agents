import { WorkflowOrchestrator } from './workflow';
import { getRoleById } from './agents/roles';
import { jsonSuccess, jsonError, validateRequestSize, summarizeIfNeeded, preflightResponse } from './utils/responses';
import type { WorkflowRequest, AgentChatRequest } from './utils/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkerEnv = Record<string, any>;

// Durable Object for workflow coordination
export class WorkflowCoordinator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any; // DurableObjectState from @cloudflare/workers-types

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(state: any) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    return Response.json({ ok: true, service: "workflow-coordinator", path: url.pathname });
  }
}

// Durable Object stub (types from Cloudflare Workers - any type acceptable here)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Env = Record<string, any>;

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

    // Check API key early for routes that require it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasApiKey = Boolean((env as any).GEMINI_API_KEY);

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
        // Lazily construct orchestrator inside try to avoid top-level crashes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orchestrator = new WorkflowOrchestrator(String((env as any).GEMINI_API_KEY));
        const workflow = await orchestrator.runWorkflow(summarized);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orchestrator = new WorkflowOrchestrator(String((env as any).GEMINI_API_KEY));
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

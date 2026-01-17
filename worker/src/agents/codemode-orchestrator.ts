import { experimental_codemode as codemode } from 'agents/codemode/ai';
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { tool } from 'ai';
import type { AgentRole } from './roles';

/**
 * Experimental Code Mode Agent Coordinator
 * 
 * Uses Cloudflare's experimental codemode to enable agents to write TypeScript code
 * that orchestrates multiple MCP operations, rather than making individual tool calls.
 * 
 * Benefits:
 * - Chain multiple MCP operations in complex workflows
 * - Handle stateful interactions with multiple round-trips
 * - Implement error handling and retry logic across MCP calls
 * - Compose different MCP servers in novel ways
 * - Perform conditional logic based on MCP responses
 * 
 * Requirements:
 * - LOADER binding in wrangler.toml
 * - globalOutbound fetch handler for security policies
 * - CodeModeProxy setup for tool execution
 */

export interface CodeModeConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  // Required: Cloudflare Worker Loader binding for Code Mode sandboxing
  loaderBinding?: unknown;
  // Optional: intercept outbound network calls from sandboxed code
  globalOutbound?: {
    fetch: (input: string | URL | RequestInfo, init?: RequestInit) => Promise<Response>;
  };
  // Optional: endpoints for MCP servers used by tools
  mcpServers?: {
    fs?: string;         // e.g. https://fs.mcp-server.com
    analysis?: string;   // e.g. https://analysis.mcp-server.com
    db?: string;         // e.g. https://db.mcp-server.com
    docs?: string;       // e.g. https://docs.mcp-server.com
  };
  // Optional: allow-list for outbound hosts
  allowedOutboundHosts?: string[]; // e.g. ['fs.mcp-server.com', 'analysis.mcp-server.com']
}

/**
 * Create a tool with codemode wrapper
 */
export function createCodeModeTool(config: {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (params: any) => Promise<any>;
}) {
  return tool({
    description: config.description,
    parameters: config.parameters,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: config.execute as any
  } as any);
}

/**
 * Create a code-enabled agent with MCP tools wrapped by experimental_codemode
 */
export async function createCodeModeAgent(
  role: AgentRole,
  config: CodeModeConfig,
  tools?: Record<string, ReturnType<typeof tool>>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _proxyConfig?: {
    binding: string;
    name: string;
    callback: string;
  }
) {
  const toolsToUse = tools || {};

  // Wrap tools with experimental codemode for MCP server orchestration
  // Using type assertions to work around experimental SDK types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await (codemode as any)({
    // Code Mode expects 'system', not 'prompt'
    system: role.systemPrompt,
    tools: toolsToUse,
    loader: config.loaderBinding,
    globalOutbound: config.globalOutbound ?? createDefaultGlobalOutbound(config.allowedOutboundHosts),
    proxy: undefined
  });

  const codeSystemPrompt = result.system || role.systemPrompt;
  const wrappedTools = result.tools || toolsToUse;

  return {
    role,
    system: codeSystemPrompt,
    tools: wrappedTools,

    /**
     * Execute agent with code generation and MCP orchestration
     */
    async execute(prompt: string): Promise<string> {
      const response = await streamText({
        model: google(config.model ?? 'gemini-2.0-flash-exp'),
        system: codeSystemPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: wrappedTools as any,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: config.temperature ?? 0.7
      });

      // Collect full response including tool calls and code execution
      let fullText = '';
      for await (const chunk of response.textStream) {
        fullText += chunk;
      }

      return fullText;
    }
  };
}

/**
 * Multi-Agent Code Mode Orchestrator for MCP Server Workflows
 * 
 * Coordinates multiple code-enabled agents to work together on complex MCP tasks
 */
export class CodeModeOrchestrator {
  private agents: Map<
    string,
    Awaited<ReturnType<typeof createCodeModeAgent>>
  >;
  private config: CodeModeConfig;

  constructor(config: CodeModeConfig) {
    this.config = config;
    this.agents = new Map();
  }

  /**
   * Register a code-enabled agent with MCP tools
   */
  async registerAgent(
    role: AgentRole,
    tools?: Record<string, ReturnType<typeof tool>>,
    proxyConfig?: { binding: string; name: string; callback: string }
  ) {
    const agent = await createCodeModeAgent(role, this.config, tools, proxyConfig);
    this.agents.set(role.id, agent);
    return agent;
  }

  /**
   * Execute a pipeline of agents
   * Each agent's output feeds into the next agent's input
   * Agents generate code to orchestrate MCP operations
   */
  async executePipeline(
    roleSequence: string[],
    initialPrompt: string,
    onStepComplete?: (roleId: string, output: string) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    let currentContext = initialPrompt;

    for (const roleId of roleSequence) {
      const agent = this.agents.get(roleId);
      if (!agent) {
        throw new Error(`Agent not registered: ${roleId}`);
      }

      console.log(`Executing agent: ${roleId}`);

      // Execute agent - it generates code to orchestrate MCP tools
      const output = await agent.execute(currentContext);
      results.set(roleId, output);

      // Callback for progress tracking
      if (onStepComplete) {
        onStepComplete(roleId, output);
      }

      // Build context for next agent
      currentContext = this.buildContextForNextAgent(
        roleId,
        output,
        results
      );
    }

    return results;
  }

  /**
   * Execute agents in parallel for independent MCP tasks
   * Each agent generates code to handle its own MCP workflows
   */
  async executeParallel(
    tasks: Array<{ roleId: string; prompt: string }>
  ): Promise<Map<string, string>> {
    const executions = tasks.map(async ({ roleId, prompt }) => {
      const agent = this.agents.get(roleId);
      if (!agent) {
        throw new Error(`Agent not registered: ${roleId}`);
      }

      const output = await agent.execute(prompt);
      return { roleId, output };
    });

    const results = await Promise.all(executions);
    return new Map(results.map(r => [r.roleId, r.output]));
  }

  /**
   * Execute with reflection loop
   * Agent reviews its generated code and iterates if needed
   */
  async executeWithReflection(
    roleId: string,
    prompt: string,
    maxIterations: number = 3,
    qualityThreshold: number = 0.8
  ): Promise<{ output: string; iterations: number; quality: number }> {
    const agent = this.agents.get(roleId);
    if (!agent) {
      throw new Error(`Agent not registered: ${roleId}`);
    }

    let output = '';
    let iterations = 0;
    let quality = 0;

    for (let i = 0; i < maxIterations; i++) {
      iterations++;

      // Execute agent - generates code for MCP orchestration
      output = await agent.execute(
        i === 0
          ? prompt
          : `Previous attempt generated:\n\`\`\`\n${output}\n\`\`\`\n\nImprove this code based on: ${prompt}`
      );

      // Self-evaluate quality of generated code
      quality = await this.evaluateQuality(output);

      if (quality >= qualityThreshold) {
        break;
      }
    }

    return { output, iterations, quality };
  }

  /**
   * Execute with human-in-the-loop approval
   * Agent generates code, human reviews, agent iterates
   */
  async executeWithApproval(
    roleId: string,
    prompt: string,
    approvalFn: (output: string) => Promise<boolean>
  ): Promise<string> {
    const agent = this.agents.get(roleId);
    if (!agent) {
      throw new Error(`Agent not registered: ${roleId}`);
    }

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;

      // Generate code for MCP orchestration
      const output = await agent.execute(prompt);
      const approved = await approvalFn(output);

      if (approved) {
        return output;
      }

      // If not approved, ask agent to revise its generated code
      prompt = `Previous attempt was not approved:\n\`\`\`\n${output}\n\`\`\`\n\nPlease revise and improve based on the original request.`;
    }

    throw new Error('Max approval attempts exceeded');
  }

  /**
   * Build context for next agent in pipeline
   */
  private buildContextForNextAgent(
    currentRoleId: string,
    currentOutput: string,
    allResults: Map<string, string>
  ): string {
    // Summarize prior outputs to control context size and focus
    const summaries = summarizeOutputs(allResults);
    return `${summaries}\n\n---\n\nContinue with your role. Generate TypeScript that orchestrates MCP operations using available tools. Focus on actionable code and avoid repeating earlier content beyond what is summarized.`;
  }

  /**
   * Evaluate quality of generated code
   * Checks for valid TypeScript, error handling, proper MCP usage
   */
  private async evaluateQuality(output: string): Promise<number> {
    let score = 0;

    const codeBlocks = extractCodeBlocks(output);
    const hasTS = codeBlocks.some(b => /\b(async|await|export|interface|type)\b/.test(b));
    const hasErrorHandling = codeBlocks.some(b => /\btry\s*\{[\s\S]*\}\s*catch\s*\(/.test(b) || /\.catch\(/.test(b));
    const usesTools = /listFiles|analyzeCode|queryDatabase|searchDocumentation/.test(output);

    if (codeBlocks.length > 0) score += 0.35;
    if (hasTS) score += 0.25;
    if (hasErrorHandling) score += 0.2;
    if (usesTools) score += 0.1;
    if (output.length > 800) score += 0.1;

    return Math.min(score, 1.0);
  }
}

/**
 * Create a specialized orchestrator for Digital Twin MCP workflows
 */
export function createDigitalTwinCodeModeOrchestrator(
  config: CodeModeConfig
) {
  const orchestrator = new CodeModeOrchestrator(config);

  // Define MCP tools that agents can orchestrate
  // These would connect to actual MCP servers
  const mpcTools = {
    // File system MCP server
    listFiles: createCodeModeTool({
      name: 'listFiles',
      description: 'List files in a directory via MCP file system server',
      parameters: z.object({
        path: z.string()
      }),
      execute: async ({ path }: { path: string }) => {
        const endpoint = config.mcpServers?.fs;
        if (!endpoint) throw new Error('MCP fs endpoint not configured');
        const body = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: 'list_files', arguments: { path } }
        };
        const resp = await requestWithRetry(`${endpoint}/list`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(body)
        }, config.allowedOutboundHosts);
        if (!resp.ok) throw new Error(`MCP fs error: ${resp.status}`);
        const data = await resp.json();
        return data.result ?? { files: [] };
      }
    }),

    // Code analysis MCP server
    analyzeCode: createCodeModeTool({
      name: 'analyzeCode',
      description: 'Analyze code for quality and issues via MCP server',
      parameters: z.object({
        code: z.string(),
        language: z.string()
      }),
      execute: async ({ code, language }: { code: string; language: string }) => {
        const endpoint = config.mcpServers?.analysis;
        if (!endpoint) throw new Error('MCP analysis endpoint not configured');
        const body = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: 'analyze_code', arguments: { code, language } }
        };
        const resp = await requestWithRetry(`${endpoint}/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(body)
        }, config.allowedOutboundHosts);
        if (!resp.ok) throw new Error(`MCP analysis error: ${resp.status}`);
        const data = await resp.json();
        return data.result ?? { issues: [], quality: 0 };
      }
    }),

    // Database MCP server
    queryDatabase: createCodeModeTool({
      name: 'queryDatabase',
      description: 'Query database via MCP database server',
      parameters: z.object({
        query: z.string(),
        params: z.array(z.any()).optional()
      }),
      execute: async ({ query, params }: { query: string; params?: unknown[] }) => {
        const endpoint = config.mcpServers?.db;
        if (!endpoint) throw new Error('MCP db endpoint not configured');
        const body = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: 'query_database', arguments: { query, params } }
        };
        const resp = await requestWithRetry(`${endpoint}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(body)
        }, config.allowedOutboundHosts);
        if (!resp.ok) throw new Error(`MCP db error: ${resp.status}`);
        const data = await resp.json();
        return data.result ?? { rows: [] };
      }
    }),

    // Documentation MCP server
    searchDocumentation: createCodeModeTool({
      name: 'searchDocumentation',
      description:
        'Search documentation via MCP documentation server',
      parameters: z.object({
        query: z.string(),
        maxResults: z.number().optional()
      }),
      execute: async ({ query, maxResults = 10 }: { query: string; maxResults?: number }) => {
        const endpoint = config.mcpServers?.docs;
        if (!endpoint) throw new Error('MCP docs endpoint not configured');
        const body = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: 'search_documentation', arguments: { query, maxResults } }
        };
        const resp = await requestWithRetry(`${endpoint}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(body)
        }, config.allowedOutboundHosts);
        if (!resp.ok) throw new Error(`MCP docs error: ${resp.status}`);
        const data = await resp.json();
        return data.result ?? { results: [] };
      }
    })
  };

  return {
    orchestrator,
    tools: mpcTools,

    /**
     * Register all Digital Twin agents
     */
    async setupAgents(proxyConfig?: {
      binding: string;
      name: string;
      callback: string;
    }) {
      // Register agents with their specialized MCP tools
      // Each agent generates code to orchestrate relevant MCP operations

      await orchestrator.registerAgent(
        {
          id: 'architect',
          name: 'System Architect',
          tier: 'strategy',
          description: 'Designs technical architecture with MCP orchestration',
          systemPrompt: `You are a System Architect. Generate TypeScript code that uses MCP servers to:
          1. Search documentation for architectural patterns
          2. Query databases for existing system designs
          3. Analyze code for architectural compliance
          4. Generate architecture diagrams and specifications
          
Your generated code should orchestrate these MCP operations intelligently.`
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mpcTools as any,
        proxyConfig
      );

      await orchestrator.registerAgent(
        {
          id: 'backend',
          name: 'Backend Developer',
          tier: 'development',
          description:
            'Implements APIs with MCP-orchestrated code generation',
          systemPrompt: `You are a Backend Developer. Generate TypeScript code that uses MCP servers to:
          1. Analyze architecture from architect's output
          2. Query databases for API patterns
          3. Search documentation for best practices
          4. Generate API implementations
          
Your generated code should orchestrate these MCP operations to build robust APIs.`
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mpcTools as any,
        proxyConfig
      );

      await orchestrator.registerAgent(
        {
          id: 'frontend',
          name: 'Frontend Developer',
          tier: 'development',
          description: 'Builds UIs with MCP-orchestrated component generation',
          systemPrompt: `You are a Frontend Developer. Generate TypeScript code that uses MCP servers to:
          1. Analyze API specifications from backend
          2. Search documentation for UI patterns
          3. Query component libraries via MCP
          4. Generate React components
          
Your generated code should orchestrate these MCP operations to create responsive UIs.`
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mpcTools as any,
        proxyConfig
      );

      return orchestrator;
    }
  };
}

/**
 * Example: Using Code Mode for MCP server workflow
 */
export async function exampleCodeModeWorkflow(
  config: CodeModeConfig
): Promise<void> {
  const { orchestrator, setupAgents } = createDigitalTwinCodeModeOrchestrator(
    config
  );

  // Setup agents with MCP tools
  await setupAgents({
    binding: 'WorkflowAgent',
    name: 'main',
    callback: 'executeCodeMode'
  });

  // Execute coordinated workflow
  // Each agent generates code to orchestrate MCP servers
  const results = await orchestrator.executePipeline(
    ['architect', 'backend', 'frontend'],
    'Build a real-time collaborative document editor',
    (roleId, output) => {
      console.log(
        `Agent ${roleId} generated code:`,
        output.substring(0, 300)
      );
    }
  );

  console.log('Workflow complete:', results);
}

/**
 * Helpers
 */
function createDefaultGlobalOutbound(allowedHosts?: string[]) {
  return {
    async fetch(input: string | URL | RequestInfo, init?: RequestInit): Promise<Response> {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const host = url.hostname;
      const allowed = allowedHosts && allowedHosts.length > 0
        ? allowedHosts
        : ['fs.mcp-server.com', 'analysis.mcp-server.com', 'db.mcp-server.com', 'docs.mcp-server.com'];
      if (!allowed.some(h => host === h || host.endsWith(`.${h}`))) {
        throw new Error(`Outbound blocked by policy: ${host}`);
      }
      return fetch(input as RequestInfo, init);
    }
  };
}

async function requestWithRetry(url: string, init: RequestInit, allowedHosts?: string[], retries = 3, backoffMs = 500): Promise<Response> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      // Optional: enforce allowed hosts at tool level too
      const host = new URL(url).hostname;
      if (allowedHosts && allowedHosts.length > 0 && !allowedHosts.some(h => host === h || host.endsWith(`.${h}`))) {
        throw new Error(`Request blocked by policy: ${host}`);
      }
      const resp = await fetch(url, init);
      if (!resp.ok && resp.status >= 500 && attempt < retries) {
        await new Promise(res => setTimeout(res, backoffMs * Math.pow(2, attempt)));
        attempt++;
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      await new Promise(res => setTimeout(res, backoffMs * Math.pow(2, attempt)));
      attempt++;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function summarizeOutputs(allResults: Map<string, string>): string {
  const entries = Array.from(allResults.entries());
  const lastTwo = entries.slice(-2);
  const summaryParts = lastTwo.map(([roleId, output]) => {
    const blocks = extractCodeBlocks(output);
    const snippet = (blocks[0] ?? output).slice(0, 2000);
    return `Role: ${roleId}\nSnippet:\n${snippet}`;
  });
  const roles = entries.map(([r]) => r).join(', ');
  return `Prior roles: ${roles}\n\n${summaryParts.join('\n\n---\n\n')}`;
}

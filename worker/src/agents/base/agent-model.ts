// BaseAgentModel: Template for all specialized agents
import type { D1Database } from '@cloudflare/workers-types';
import { AIGatewayClient, LLMChatParams, LLMChatResult } from '../../ai-gateway/client';
export type AgentRole = string;
export type PrivilegeLevel = 'read' | 'write' | 'admin';

export interface MCPTool {
  name: string;
  requiredPrivilege: PrivilegeLevel;
  execute: (params: unknown) => Promise<unknown>;
}

export interface AgentContext {
  [key: string]: unknown;
}

export interface AgentResult {
  output: string;
  toolResults?: unknown[];
  metadata?: Record<string, unknown>;
}

export abstract class BaseAgentModel {
  protected role: AgentRole;
  protected mcpTools: Map<string, MCPTool>;
  protected privilegeLevel: PrivilegeLevel;
  protected aiGateway?: AIGatewayClient;

  constructor(role: AgentRole, tools: MCPTool[], privilegeLevel: PrivilegeLevel) {
    this.role = role;
    this.privilegeLevel = privilegeLevel;
    this.mcpTools = new Map(tools.map(t => [t.name, t]));
  }

  // Attach AI Gateway client for LLM calls
  attachAIGateway(baseUrl: string, db: D1Database) {
    this.aiGateway = new AIGatewayClient(baseUrl, db);
  }

  // Override in subclasses for custom behavior
  abstract execute(task: string, context: AgentContext): Promise<AgentResult>;

  // Common MCP tool access with privilege enforcement
  protected async callMCPTool(toolName: string, params: unknown): Promise<unknown> {
    const tool = this.mcpTools.get(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not available`);
    if (tool.requiredPrivilege === 'admin' && this.privilegeLevel !== 'admin') {
      throw new Error(`Insufficient privileges for ${toolName}`);
    }
    return await tool.execute(params);
  }

  // LLM chat via AI Gateway
  protected async callLLM(params: Omit<LLMChatParams, 'agentId'>): Promise<LLMChatResult> {
    if (!this.aiGateway) throw new Error('AI Gateway client not attached');
    return await this.aiGateway.chat({ ...params, agentId: this.role });
  }
}

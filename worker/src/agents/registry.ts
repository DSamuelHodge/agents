import { BaseAgentModel, MCPTool, PrivilegeLevel, AgentResult } from './base/agent-model';

export interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  mcpTools: string[];
  privilegeLevel: PrivilegeLevel;
  containerImage?: string;
}

export class AgentRegistry {
  private definitions = new Map<string, AgentDefinition>();
  private mcpRegistry: { getTool: (name: string) => Promise<MCPTool | null> };

  constructor(mcpRegistry: { getTool: (name: string) => Promise<MCPTool | null> }) {
    this.mcpRegistry = mcpRegistry;
  }

  async registerAgent(def: AgentDefinition): Promise<void> {
    this.definitions.set(def.id, def);
    // Persist to D1 if needed
  }

  async createAgent(agentId: string): Promise<BaseAgentModel> {
    const def = this.definitions.get(agentId);
    if (!def) throw new Error('Agent not found');
    const tools: MCPTool[] = [];
    for (const toolName of def.mcpTools) {
      const tool = await this.mcpRegistry.getTool(toolName);
      if (tool) tools.push(tool);
    }
    return new DynamicAgent(def, tools);
  }
}

class DynamicAgent extends BaseAgentModel {
  private def: AgentDefinition;
  constructor(def: AgentDefinition, tools: MCPTool[]) {
    super(def.id, tools, def.privilegeLevel);
    this.def = def;
  }
  async execute(): Promise<AgentResult> {
    // Placeholder: Use systemPrompt, call LLM, etc.
    return { output: `Executed by ${this.def.name}` };
  }
}

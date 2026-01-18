import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry, AgentDefinition } from '../worker/src/agents/registry';
import { MCPTool } from '../worker/src/agents/base/agent-model';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let mockGetTool: any;

  beforeEach(() => {
    mockGetTool = vi.fn(async (name: string) => ({ name, requiredPrivilege: 'read', execute: vi.fn() } as MCPTool));
    registry = new AgentRegistry({ getTool: mockGetTool });
  });

  it('registers and creates agent', async () => {
    const def: AgentDefinition = {
      id: 'pm',
      name: 'Product Manager',
      systemPrompt: 'You are a PM.',
      mcpTools: ['toolA'],
      privilegeLevel: 'read'
    };
    await registry.registerAgent(def);
    const agent = await registry.createAgent('pm');
    expect(agent).toBeDefined();
    expect(agent['role']).toBe('pm');
  });

  it('throws for missing agent', async () => {
    await expect(registry.createAgent('notfound')).rejects.toThrow('Agent not found');
  });
});

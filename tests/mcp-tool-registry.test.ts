import { describe, it, expect, beforeEach } from 'vitest';
import { MCPToolRegistry } from '../worker/src/mcp/registry';
import { z } from 'zod';

describe('MCPToolRegistry', () => {
  let registry: MCPToolRegistry;

  beforeEach(() => {
    registry = new MCPToolRegistry();
  });

  it('registers and retrieves a tool', () => {
    registry.registerTool({
      name: 'test_tool',
      description: 'A test tool',
      parameters: { foo: z.string() },
      requiredPrivilege: 'read',
      handler: async ({ foo }) => ({ ok: foo })
    });
    const tool = registry.getTool('test_tool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('test_tool');
  });

  it('enforces privilege', async () => {
    registry.registerTool({
      name: 'admin_tool',
      description: 'Admin only',
      parameters: {},
      requiredPrivilege: 'admin',
      handler: async () => ({ ok: true })
    });
    await expect(registry.callTool('admin_tool', {}, 'read')).rejects.toThrow('Insufficient privilege');
  });

  it('validates parameters', async () => {
    registry.registerTool({
      name: 'param_tool',
      description: 'Param test',
      parameters: { foo: z.string() },
      requiredPrivilege: 'read',
      handler: async ({ foo }) => ({ ok: foo })
    });
    await expect(registry.callTool('param_tool', { foo: 123 }, 'read')).rejects.toThrow();
  });

  it('calls handler with validated params', async () => {
    registry.registerTool({
      name: 'echo',
      description: 'Echo tool',
      parameters: { msg: z.string() },
      requiredPrivilege: 'read',
      handler: async ({ msg }) => ({ echoed: msg })
    });
    const result = await registry.callTool('echo', { msg: 'hi' }, 'read');
    expect(result).toEqual({ echoed: 'hi' });
  });
});

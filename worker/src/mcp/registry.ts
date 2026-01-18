import { z } from 'zod';


export type MCPToolParams = Record<string, z.ZodTypeAny>;
export type MCPToolPrivilege = 'read' | 'write' | 'admin';
export interface MCPToolMeta<P = unknown, R = unknown, C = unknown> {
  name: string;
  description: string;
  parameters: MCPToolParams;
  requiredPrivilege: MCPToolPrivilege;
  handler: (params: P, context?: C) => Promise<R>;
}


export class MCPToolRegistry {
  private tools = new Map<string, MCPToolMeta<unknown, unknown, unknown>>();

  registerTool<P, R, C>(tool: MCPToolMeta<P, R, C>): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool ${tool.name} already registered`);
    this.tools.set(tool.name, tool as MCPToolMeta<unknown, unknown, unknown>);
  }

  getTool<P = unknown, R = unknown, C = unknown>(name: string): MCPToolMeta<P, R, C> | null {
    return (this.tools.get(name) as MCPToolMeta<P, R, C>) || null;
  }

  listTools(): MCPToolMeta<unknown, unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  async callTool<P, R, C>(name: string, params: P, privilege: MCPToolPrivilege, context?: C): Promise<R> {
    const tool = this.getTool<P, R, C>(name);
    if (!tool) throw new Error('Tool not found');
    if (privilege !== 'admin' && tool.requiredPrivilege === 'admin') {
      throw new Error('Insufficient privilege');
    }
    // Validate params
    const schema = z.object(tool.parameters as Record<string, z.ZodTypeAny>);
    const parsed = schema.parse(params);
    return await tool.handler(parsed as unknown as P, context);
  }
}

// Example usage (to be replaced by actual server integration):
// const registry = new MCPToolRegistry();
// registry.registerTool({
//   name: 'kv_namespace_create',
//   description: 'Create a new KV namespace',
//   parameters: { title: z.string() },
//   requiredPrivilege: 'write',
//   handler: async ({ title }) => ({ id: 'abc', title })
// });

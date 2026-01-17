// KV-based agent response caching
import type { KVNamespace } from '@cloudflare/workers-types';

export class AgentKVCache {
  constructor(private kv: KVNamespace) {}

  async getCachedResponse(role: string, input: string): Promise<string | null> {
    const key = this.getCacheKey(role, input);
    return await this.kv.get(key);
  }

  async setCachedResponse(role: string, input: string, output: string, ttl = 3600) {
    const key = this.getCacheKey(role, input);
    await this.kv.put(key, output, { expirationTtl: ttl });
  }

  private getCacheKey(role: string, input: string): string {
    const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return `agent:${role}:${hash}`;
  }
}

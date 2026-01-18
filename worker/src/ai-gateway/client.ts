// AI Gateway client for Cloudflare LLM integration
import type { D1Database } from '@cloudflare/workers-types';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMChatParams {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  messages: LLMMessage[];
  agentId: string;
  cacheKey?: string;
  cacheTTL?: number;
}

export interface LLMChatResult {
  content: string;
  tokens: number;
  cost: number;
  cached: boolean;
}

export class AIGatewayClient {
  constructor(private baseUrl: string, private db: D1Database) {}

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.cacheKey) {
      headers['cf-aig-cache-key'] = params.cacheKey;
      headers['cf-aig-cache-ttl'] = String(params.cacheTTL ?? 3600);
    }
    const response = await fetch(
      `${this.baseUrl}/${params.provider}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
        }),
      }
    );
    const data = await response.json();
    const tokens = data.usage?.total_tokens ?? 0;
    const cost = data.usage?.total_cost ?? 0;
    const cached = response.headers.get('cf-cache-status') === 'HIT';
    // Log usage to D1
    await this.db.prepare(
      `INSERT INTO llm_usage (agent_id, provider, model, tokens, cost, cached, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.agentId,
      params.provider,
      params.model,
      tokens,
      cost,
      cached ? 1 : 0,
      Date.now(),
      JSON.stringify({ cacheKey: params.cacheKey })
    ).run();
    return {
      content: data.choices[0].message.content,
      tokens,
      cost,
      cached,
    };
  }
}

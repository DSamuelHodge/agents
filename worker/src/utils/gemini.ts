import { GoogleGenAI } from '@google/genai';

export interface GeminiConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gemini-2.5-flash';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 2000;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const fullPrompt = systemPrompt 
      ? `${systemPrompt}\n\nUser Request:\n${prompt}`
      : prompt;

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.ai.models.generateContent({
          model: this.model,
          contents: fullPrompt
        });
        return result.text || '';
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a retryable error
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isRetryable = 
          errorMsg.includes('rate limit') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('503') ||
          errorMsg.includes('429');

        if (!isRetryable || attempt === this.maxRetries - 1) {
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
        );
      }
    }

    throw lastError || new Error('Failed to generate content');
  }

  async generateWithContext(
    prompt: string,
    systemPrompt: string,
    context: Record<string, unknown>
  ): Promise<string> {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
    
    const fullPrompt = `${prompt}\n\nContext:\n${contextStr}`;
    return this.generate(fullPrompt, systemPrompt);
  }
}

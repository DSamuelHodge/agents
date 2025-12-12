const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://127.0.0.1:8787';

export interface WorkflowRequest {
  featureRequest: string;
}

export interface AgentStep {
  roleId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  input: string;
  output?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkflowRun {
  id: string;
  featureRequest: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: AgentStep[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentChatRequest {
  message: string;
  context?: Record<string, unknown>;
}

export interface ApiError {
  ok: false;
  message: string;
  details?: string;
  code?: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  metadata?: Record<string, unknown>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = WORKER_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as ApiError;
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return (data as ApiSuccess<T>).data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network request failed');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getStatus(): Promise<{ ok: boolean; services: Record<string, any> }> {
    return this.request('/status');
  }

  async runWorkflow(featureRequest: string): Promise<WorkflowRun> {
    return this.request<WorkflowRun>('/workflow', {
      method: 'POST',
      body: JSON.stringify({ featureRequest }),
    });
  }

  async agentChat(
    roleId: string,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: Record<string, any>
  ): Promise<{ roleId: string; output: string; role: string }> {
    return this.request(`/agent/${roleId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, context }),
    });
  }
}

export const apiClient = new ApiClient();

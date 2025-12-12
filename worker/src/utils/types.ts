export interface WorkflowRun {
  id: string;
  featureRequest: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: AgentStep[];
  createdAt: string;
  updatedAt: string;
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

export interface WorkflowRequest {
  featureRequest: string;
}

export interface AgentChatRequest {
  message: string;
  context?: Record<string, unknown>;
}

export interface ErrorResponse {
  ok: false;
  message: string;
  details?: string;
  code?: string;
}

export interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
  metadata?: Record<string, unknown>;
}

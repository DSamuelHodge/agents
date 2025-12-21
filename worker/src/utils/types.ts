export interface WorkflowRun {
  id: string;
  featureRequest: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: AgentStep[];
  createdAt: string;
  updatedAt: string;
  artifactUrl?: string;
  prNumber?: number;
  branch?: string;
  quality?: CodeQualitySummary;
  qualityGatePassed?: boolean;
}

export interface CodeQualityIssue {
  tool: 'prettier' | 'typescript' | 'sql' | 'json' | 'yaml' | 'python' | 'project';
  severity: 'error' | 'warning';
  filePath: string;
  message: string;
}

export interface CodeQualitySummary {
  score: number; // 0-100
  errors: number;
  warnings: number;
  formattedFiles: number;
  coverageEstimate: number; // 0-100 heuristic
  issues: CodeQualityIssue[];
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

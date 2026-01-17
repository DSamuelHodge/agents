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
  score: number;
  errors: number;
  warnings: number;
  formattedFiles: number;
  coverageEstimate: number;
  issues: CodeQualityIssue[];
}

export interface PullRequestStatus {
  prNumber: number;
  state: 'open' | 'closed' | 'merged';
  merged: boolean;
  approvals: number;
  requiredApprovals: number;
  requiredReviewers?: string[];
  approvedBy?: string[];
  missingReviewers?: string[];
  label: 'open' | 'closed' | 'merged' | 'approved';
}

export interface AppSettings {
  github: {
    owner: string;
    repo: string;
  };
  autoMerge: boolean;
  requiredApprovals: number;
  requiredReviewers: string[];
  deploymentEnvironment: string;
  updatedAt?: string;
}

export interface AppSettingsUpdate {
  github?: {
    owner?: string;
    repo?: string;
  };
  autoMerge?: boolean;
  requiredApprovals?: number;
  requiredReviewers?: string[];
  deploymentEnvironment?: string;
}

export interface PullRequestFileDiff {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
}

export interface PullRequestDiff {
  prNumber: number;
  files: PullRequestFileDiff[];
}

export interface PullRequestReviewComment {
  id: number;
  url: string;
  user: string;
  body: string;
  path: string;
  line?: number | null;
  side?: 'LEFT' | 'RIGHT' | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PullRequestReviewComments {
  prNumber: number;
  comments: PullRequestReviewComment[];
}

export interface WorkflowHistoryItem {
  id: string;
  featureRequest: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  createdAt: string;
  updatedAt: string;
  artifactUrl?: string;
  prNumber?: number;
  branch?: string;
  qualityGatePassed?: boolean;
  qualityScore?: number;
  pr?: {
    state: 'open' | 'closed' | 'merged';
    merged: boolean;
    approvals: number;
  };
}

export interface WorkflowHistoryResponse {
  items: WorkflowHistoryItem[];
}

export interface WorkflowHistoryRunResponse {
  workflow: WorkflowRun;
}

export interface WorkflowCompareDiffItem {
  roleId: string;
  a: string;
  b: string;
  same: boolean;
}

export interface WorkflowCompareResponse {
  a: string;
  b: string;
  diff: WorkflowCompareDiffItem[];
}

export interface WorkflowExportResponse {
  exportedAt: string;
  workflow: WorkflowRun;
  audit?: unknown;
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

  // Agents SDK: WorkflowAgent status
  // Uses /workflow-agent/:instance-id/status routed to agent's onRequest
  async getAgentStatus(instanceId: string = 'main'): Promise<{ ok: boolean; agent: string; activeConnections: number; workflowCount: number; lastUpdated: string }> {
    return this.request(`/workflow-agent/${encodeURIComponent(instanceId)}/status`);
  }

  // Agents SDK: WorkflowAgent current state snapshot
  async getAgentState(instanceId: string = 'main'): Promise<{ ok: boolean; state: { currentWorkflow?: WorkflowRun; historyCount: number; settings: AppSettings; activeConnections: number } }> {
    return this.request(`/workflow-agent/${encodeURIComponent(instanceId)}`);
  }

  async runWorkflow(featureRequest: string): Promise<WorkflowRun> {
    return this.request<WorkflowRun>('/workflow', {
      method: 'POST',
      body: JSON.stringify({ featureRequest }),
    });
  }

  async getSettings(): Promise<AppSettings> {
    return this.request('/settings');
  }

  async updateSettings(update: AppSettingsUpdate): Promise<AppSettings> {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(update),
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

  async getPullRequestStatus(prNumber: number): Promise<PullRequestStatus> {
    return this.request(`/github/pr/status?prNumber=${encodeURIComponent(String(prNumber))}`);
  }

  async getPullRequestDiff(prNumber: number): Promise<PullRequestDiff> {
    return this.request(`/github/pr/diff?prNumber=${encodeURIComponent(String(prNumber))}`);
  }

  async listPullRequestReviewComments(prNumber: number): Promise<PullRequestReviewComments> {
    return this.request(`/github/pr/review-comments?prNumber=${encodeURIComponent(String(prNumber))}`);
  }

  async createPullRequestReviewComment(input: {
    prNumber: number;
    path: string;
    line: number;
    body: string;
    side?: 'LEFT' | 'RIGHT';
  }): Promise<{ prNumber: number; id: number; url: string }> {
    return this.request('/github/pr/review-comments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async approvePullRequest(prNumber: number, notes?: string): Promise<{ prNumber: number; approved: boolean }> {
    return this.request('/github/pr/approve', {
      method: 'POST',
      body: JSON.stringify({ prNumber, notes }),
    });
  }

  async mergePullRequest(input: {
    prNumber: number;
    method?: 'merge' | 'squash' | 'rebase';
    notes?: string;
  }): Promise<{ prNumber: number; merged: boolean; message?: string; sha?: string; method: string }> {
    return this.request('/github/pr/merge', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listWorkflowHistory(limit: number = 50, includePrStatus: boolean = true): Promise<WorkflowHistoryResponse> {
    const qs = new URLSearchParams({
      limit: String(limit),
      includePrStatus: includePrStatus ? 'true' : 'false'
    });
    return this.request(`/history?${qs.toString()}`);
  }

  async getWorkflowHistoryRun(id: string): Promise<WorkflowHistoryRunResponse> {
    return this.request(`/history/run?id=${encodeURIComponent(id)}`);
  }

  async compareWorkflowHistory(a: string, b: string): Promise<WorkflowCompareResponse> {
    const qs = new URLSearchParams({ a, b });
    return this.request(`/history/compare?${qs.toString()}`);
  }

  async exportWorkflowHistory(id: string): Promise<WorkflowExportResponse> {
    return this.request(`/history/export?id=${encodeURIComponent(id)}`);
  }
}

export const apiClient = new ApiClient();

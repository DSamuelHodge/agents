import { GitHubClient, WorkflowRunStatus } from '../utils/github';

export interface DeploymentManagerOptions {
  workflowFile?: string;
  requiredApprovals?: number;
  environment?: string;
  notifyWebhookUrl?: string;
  rollbackWebhookUrl?: string;
}

export interface DeploymentTriggerResult {
  prNumber: number;
  branch: string;
  dispatched: boolean;
  workflowFile: string;
  run: WorkflowRunStatus | null;
}

export interface DeploymentStatusResult {
  prNumber: number;
  branch: string;
  workflowFile: string;
  run: WorkflowRunStatus | null;
  notified?: boolean;
  rolledBack?: boolean;
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  payload: unknown
): Promise<void> {
  await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export class DeploymentManager {
  private github: GitHubClient;
  private options: Required<Pick<DeploymentManagerOptions, 'workflowFile' | 'requiredApprovals'>> &
    Omit<DeploymentManagerOptions, 'workflowFile' | 'requiredApprovals'>;
  private fetchImpl: typeof fetch;

  constructor(
    github: GitHubClient,
    options?: DeploymentManagerOptions,
    fetchImpl: typeof fetch = fetch
  ) {
    this.github = github;
    this.options = {
      workflowFile: options?.workflowFile || 'agents.yml',
      requiredApprovals: options?.requiredApprovals ?? 1,
      environment: options?.environment,
      notifyWebhookUrl: options?.notifyWebhookUrl,
      rollbackWebhookUrl: options?.rollbackWebhookUrl
    };
    this.fetchImpl = fetchImpl;
  }

  async triggerDeploymentForPullRequest(prNumber: number): Promise<DeploymentTriggerResult> {
    const status = await this.github.getPRStatus(prNumber);
    if (status.state !== 'open' || status.merged) {
      throw new Error('PR must be open and not merged to deploy');
    }

    if (status.approvals < this.options.requiredApprovals) {
      throw new Error(
        `PR requires ${this.options.requiredApprovals} approval(s) before deploy (has ${status.approvals})`
      );
    }

    const pr = await this.github.getPullRequest(prNumber);

    const inputs: Record<string, string> = {
      pr: String(prNumber),
      sha: pr.sha
    };

    const environment = String(this.options.environment ?? '').trim();
    if (environment) {
      inputs.environment = environment;
    }

    await this.github.dispatchWorkflow(this.options.workflowFile, pr.branch, inputs);

    const run = await this.github.getLatestWorkflowRun(
      this.options.workflowFile,
      pr.branch,
      'workflow_dispatch'
    );

    return {
      prNumber,
      branch: pr.branch,
      dispatched: true,
      workflowFile: this.options.workflowFile,
      run
    };
  }

  async getDeploymentStatusForPullRequest(
    prNumber: number,
    actions?: { notify?: boolean; rollbackOnFailure?: boolean }
  ): Promise<DeploymentStatusResult> {
    const pr = await this.github.getPullRequest(prNumber);

    const run = await this.github.getLatestWorkflowRun(
      this.options.workflowFile,
      pr.branch
    );

    let notified = false;
    let rolledBack = false;

    if (run && run.status === 'completed') {
      const payload = {
        prNumber,
        branch: pr.branch,
        workflowFile: this.options.workflowFile,
        run
      };

      if (actions?.notify && this.options.notifyWebhookUrl) {
        try {
          await postJson(this.fetchImpl, this.options.notifyWebhookUrl, payload);
          notified = true;
        } catch {
          // best-effort
        }
      }

      if (
        actions?.rollbackOnFailure &&
        this.options.rollbackWebhookUrl &&
        run.conclusion &&
        run.conclusion !== 'success'
      ) {
        try {
          await postJson(this.fetchImpl, this.options.rollbackWebhookUrl, payload);
          rolledBack = true;
        } catch {
          // best-effort
        }
      }
    }

    return {
      prNumber,
      branch: pr.branch,
      workflowFile: this.options.workflowFile,
      run,
      notified: notified || undefined,
      rolledBack: rolledBack || undefined
    };
  }
}

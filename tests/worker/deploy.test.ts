import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowRunStatus } from '@worker/utils/github';

const githubMocks = vi.hoisted(() => {
  return {
    getPRStatus: vi.fn<(_prNumber: number) => Promise<{ state: 'open' | 'closed' | 'merged'; merged: boolean; approvals: number }>>(),
    getPullRequest: vi.fn<(_prNumber: number) => Promise<{ branch: string; sha: string }>>(),
    dispatchWorkflow: vi.fn<(_workflowFile: string, _ref: string, _inputs?: Record<string, string>) => Promise<void>>(),
    getLatestWorkflowRun: vi.fn<(_workflowFile: string, _branch: string, _event?: string) => Promise<WorkflowRunStatus | null>>()
  };
});

vi.mock('@worker/utils/github', () => {
  class GitHubClient {
    getPRStatus = githubMocks.getPRStatus;
    getPullRequest = githubMocks.getPullRequest;
    dispatchWorkflow = githubMocks.dispatchWorkflow;
    getLatestWorkflowRun = githubMocks.getLatestWorkflowRun;

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(_config: unknown) {}
  }

  return { GitHubClient };
});

describe('E3-T003: Deployment trigger in Worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    githubMocks.getPRStatus.mockResolvedValue({ state: 'open', merged: false, approvals: 1 });
    githubMocks.getPullRequest.mockResolvedValue({ branch: 'agents/workflow-wf-123', sha: 'abc123' });
    githubMocks.dispatchWorkflow.mockResolvedValue(undefined);
    githubMocks.getLatestWorkflowRun.mockResolvedValue({
      id: 99,
      status: 'queued',
      conclusion: null,
      htmlUrl: 'https://github.com/acme/generated/actions/runs/99'
    });
  });

  it('triggers workflow_dispatch when PR has required approvals', async () => {
    const { GitHubClient } = await import('@worker/utils/github');
    const { DeploymentManager } = await import('@worker/deploy/manager');

    const github = new GitHubClient({ token: 'x', owner: 'acme', repo: 'generated' });
    const manager = new DeploymentManager(github as any, {
      workflowFile: 'agents.yml',
      requiredApprovals: 1
    });

    const result = await manager.triggerDeploymentForPullRequest(123);

    expect(result.dispatched).toBe(true);
    expect(githubMocks.dispatchWorkflow).toHaveBeenCalledWith('agents.yml', 'agents/workflow-wf-123', {
      pr: '123',
      sha: 'abc123'
    });
  });

  it('rejects deployment when approvals are insufficient', async () => {
    githubMocks.getPRStatus.mockResolvedValue({ state: 'open', merged: false, approvals: 0 });

    const { GitHubClient } = await import('@worker/utils/github');
    const { DeploymentManager } = await import('@worker/deploy/manager');

    const github = new GitHubClient({ token: 'x', owner: 'acme', repo: 'generated' });
    const manager = new DeploymentManager(github as any, {
      workflowFile: 'agents.yml',
      requiredApprovals: 1
    });

    await expect(manager.triggerDeploymentForPullRequest(123)).rejects.toThrow(/requires 1 approval/i);
  });

  it('optionally notifies and rolls back on failed completed run', async () => {
    githubMocks.getLatestWorkflowRun.mockResolvedValue({
      id: 100,
      status: 'completed',
      conclusion: 'failure',
      htmlUrl: 'https://github.com/acme/generated/actions/runs/100'
    });

    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));

    const { GitHubClient } = await import('@worker/utils/github');
    const { DeploymentManager } = await import('@worker/deploy/manager');

    const github = new GitHubClient({ token: 'x', owner: 'acme', repo: 'generated' });
    const manager = new DeploymentManager(
      github as any,
      {
        workflowFile: 'agents.yml',
        notifyWebhookUrl: 'https://notify.example.com',
        rollbackWebhookUrl: 'https://rollback.example.com'
      },
      fetchMock as any
    );

    const result = await manager.getDeploymentStatusForPullRequest(123, {
      notify: true,
      rollbackOnFailure: true
    });

    expect(result.run?.id).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://notify.example.com');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://rollback.example.com');
  });
});

import { Octokit } from '@octokit/rest';
import { WorkflowRun } from './types';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface PullRequestResult {
  url: string;
  number: number;
  branch: string;
}

export interface PullRequestInfo {
  url: string;
  number: number;
  branch: string;
  sha: string;
  state: 'open' | 'closed';
  merged: boolean;
}

export interface WorkflowRunStatus {
  id: number;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  htmlUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PullRequestFileDiff {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
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

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

export interface BranchProtectionSettings {
  branch?: string;
  requiredStatusChecks?: {
    strict?: boolean;
    contexts: string[];
  } | null;
  requiredApprovingReviewCount?: number;
  dismissStaleReviews?: boolean;
  requireCodeOwnerReviews?: boolean;
  enforceAdmins?: boolean;
}

type ExistingBranchProtection = {
  required_status_checks?: BranchProtectionSettings['requiredStatusChecks'];
  enforce_admins?: { enabled: boolean } | boolean | null;
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    dismiss_stale_reviews?: boolean;
    require_code_owner_reviews?: boolean;
  } | null;
};

export class GitHubClient {
  private octokit: InstanceType<typeof Octokit>;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.token });
  }

  /**
   * Configure branch protection on a target branch.
   * Note: This requires repo admin permissions for the token.
   */
  async setBranchProtection(settings: BranchProtectionSettings): Promise<void> {
    const branch = settings.branch || 'main';
    try {
      let existing: ExistingBranchProtection | undefined;
      try {
        const { data } = await this.octokit.rest.repos.getBranchProtection({
          owner: this.config.owner,
          repo: this.config.repo,
          branch
        });
        existing = data as unknown as ExistingBranchProtection;
      } catch {
        // Branch may not have protection yet; proceed with defaults.
      }

      const requiredStatusChecks =
        settings.requiredStatusChecks === undefined
          ? (existing?.required_status_checks ?? null)
          : settings.requiredStatusChecks;

      const normalizedRequiredStatusChecks =
        requiredStatusChecks && typeof requiredStatusChecks === 'object'
          ? {
              ...requiredStatusChecks,
              strict: (requiredStatusChecks as { strict?: boolean }).strict ?? true
            }
          : requiredStatusChecks;
      const enforceAdmins =
        settings.enforceAdmins === undefined
          ? typeof existing?.enforce_admins === 'boolean'
            ? existing.enforce_admins
            : existing?.enforce_admins && typeof existing.enforce_admins === 'object'
              ? existing.enforce_admins.enabled
              : null
          : settings.enforceAdmins;

      const wantReviews =
        settings.requiredApprovingReviewCount !== undefined ||
        settings.dismissStaleReviews !== undefined ||
        settings.requireCodeOwnerReviews !== undefined;
      const requiredPullRequestReviews = wantReviews
        ? {
            required_approving_review_count:
              settings.requiredApprovingReviewCount ?? 1,
            dismiss_stale_reviews: settings.dismissStaleReviews ?? true,
            require_code_owner_reviews:
              settings.requireCodeOwnerReviews ?? false
          }
        : existing?.required_pull_request_reviews
          ? {
              required_approving_review_count:
                existing.required_pull_request_reviews
                  .required_approving_review_count ?? 1,
              dismiss_stale_reviews:
                existing.required_pull_request_reviews.dismiss_stale_reviews ??
                true,
              require_code_owner_reviews:
                existing.required_pull_request_reviews
                  .require_code_owner_reviews ?? false
            }
          : null;

      await this.octokit.rest.repos.updateBranchProtection({
        owner: this.config.owner,
        repo: this.config.repo,
        branch,
        required_status_checks: normalizedRequiredStatusChecks,
        enforce_admins: enforceAdmins,
        required_pull_request_reviews: requiredPullRequestReviews,
        restrictions: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to set branch protection: ${message}`);
    }
  }

  /**
   * Enable auto-merge for a PR (if the repo has auto-merge enabled).
   */
  async enableAutoMerge(
    prNumber: number,
    method: PullRequestMergeMethod = 'squash'
  ): Promise<void> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber
      });

      const pullRequestId = pr.node_id;
      const mergeMethod =
        method === 'merge'
          ? 'MERGE'
          : method === 'rebase'
            ? 'REBASE'
            : 'SQUASH';

      const query = [
        'mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {',
        '  enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {',
        '    pullRequest { number }',
        '  }',
        '}'
      ].join('\n');

      await this.octokit.request('POST /graphql', {
        query,
        variables: {
          pullRequestId,
          mergeMethod
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to enable auto-merge: ${message}`);
    }
  }

  /**
   * Validate GitHub token and permissions
   */
  async validateToken(): Promise<boolean> {
    try {
      const { data } = await this.octokit.rest.users.getAuthenticated();
      return !!data.login;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`GitHub token invalid or expired: ${message}`);
    }
  }

  /**
   * Create a feature branch for workflow artifacts
   */
  async createBranch(workflowId: string): Promise<string> {
    try {
      // Get main branch SHA
      const { data: mainRef } = await this.octokit.rest.git.getRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: 'heads/main'
      });

      const branchName = `agents/workflow-${workflowId}`;

      // Create new branch
      await this.octokit.rest.git.createRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `refs/heads/${branchName}`,
        sha: mainRef.object.sha
      });

      return branchName;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create branch: ${message}`);
    }
  }

  /**
   * Commit files to a branch
   */
  async commitFiles(
    branchName: string,
    files: Record<string, string>,
    message: string
  ): Promise<string> {
    try {
      // Get current branch ref
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${branchName}`
      });

      // Create tree from files
      const tree = await Promise.all(
        Object.entries(files).map(async ([path, content]) => ({
          path,
          mode: '100644' as const,
          type: 'blob' as const,
          content
        }))
      );

      const { data: treeData } = await this.octokit.rest.git.createTree({
        owner: this.config.owner,
        repo: this.config.repo,
        tree,
        base_tree: ref.object.sha
      });

      // Create commit
      const { data: commitData } = await this.octokit.rest.git.createCommit({
        owner: this.config.owner,
        repo: this.config.repo,
        message,
        tree: treeData.sha,
        parents: [ref.object.sha]
      });

      // Update branch ref
      await this.octokit.rest.git.updateRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${branchName}`,
        sha: commitData.sha
      });

      return commitData.sha;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to commit files: ${message}`);
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    branchName: string,
    workflow: WorkflowRun
  ): Promise<PullRequestResult> {
    try {
      // Create PR description from workflow outputs
      const description = this.buildPRDescription(workflow);

      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title: `AI-Generated: ${workflow.featureRequest.substring(0, 60)}...`,
        body: description,
        head: branchName,
        base: 'main'
      });

      return {
        url: pr.html_url,
        number: pr.number,
        branch: branchName
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create PR: ${message}`);
    }
  }

  /**
   * Post a comment on a pull request
   */
  async postPRComment(prNumber: number, comment: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: prNumber,
        body: comment
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to post PR comment: ${message}`);
    }
  }

  /**
   * Check PR status
   */
  async getPRStatus(prNumber: number): Promise<{
    state: 'open' | 'closed' | 'merged';
    merged: boolean;
    approvals: number;
  }> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber
      });

      const { data: reviews } = await this.octokit.rest.pulls.listReviews({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber
      });

      const approvals = reviews.filter(r => r.state === 'APPROVED').length;

      return {
        state: pr.merged ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
        merged: pr.merged || false,
        approvals
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get PR status: ${message}`);
    }
  }

  /**
   * Return unique approvers and when they approved.
   * Best-effort helper for audit logging.
   */
  async getPRApprovalDetails(prNumber: number): Promise<
    Array<{ user: string; submittedAt: string }>
  > {
    try {
      const { data: reviews } = await this.octokit.rest.pulls.listReviews({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber
      });

      const byUser = new Map<string, string>();

      for (const review of reviews) {
        if (review.state !== 'APPROVED') continue;
        const user = review.user?.login;
        const submittedAt = review.submitted_at;
        if (!user || !submittedAt) continue;

        const existing = byUser.get(user);
        if (!existing || submittedAt > existing) {
          byUser.set(user, submittedAt);
        }
      }

      return Array.from(byUser.entries())
        .map(([user, submittedAt]) => ({ user, submittedAt }))
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get PR approval details: ${message}`);
    }
  }

  /**
   * Read PR details needed for deployments.
   */
  async getPullRequest(prNumber: number): Promise<PullRequestInfo> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber
      });

      return {
        url: pr.html_url,
        number: pr.number,
        branch: pr.head.ref,
        sha: pr.head.sha,
        state: pr.state === 'open' ? 'open' : 'closed',
        merged: pr.merged || false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get PR details: ${message}`);
    }
  }

  /**
   * Dispatch a GitHub Actions workflow run.
   * `workflowFile` is typically a filename like `agents.yml`.
   */
  async dispatchWorkflow(
    workflowFile: string,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    try {
      await this.octokit.rest.actions.createWorkflowDispatch({
        owner: this.config.owner,
        repo: this.config.repo,
        workflow_id: workflowFile,
        ref,
        inputs
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to dispatch workflow: ${message}`);
    }
  }

  /**
   * Get the latest workflow run for a workflow on a specific branch.
   */
  async getLatestWorkflowRun(
    workflowFile: string,
    branch: string,
    event?: string
  ): Promise<WorkflowRunStatus | null> {
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRuns({
        owner: this.config.owner,
        repo: this.config.repo,
        workflow_id: workflowFile,
        branch,
        event,
        per_page: 1
      });

      const run = data.workflow_runs?.[0];
      if (!run) return null;

      return {
        id: run.id,
        status: run.status as WorkflowRunStatus['status'],
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        createdAt: run.created_at,
        updatedAt: run.updated_at
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get workflow runs: ${message}`);
    }
  }

  /**
   * List PR files with patch hunks (best-effort).
   */
  async listPullRequestFiles(prNumber: number): Promise<PullRequestFileDiff[]> {
    try {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        per_page: 100
      });

      return data.map(file => ({
        filename: file.filename,
        status: String(file.status),
        additions: Number(file.additions ?? 0),
        deletions: Number(file.deletions ?? 0),
        changes: Number(file.changes ?? 0),
        patch: (file as unknown as { patch?: string }).patch ?? null
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list PR files: ${message}`);
    }
  }

  /**
   * List inline PR review comments.
   */
  async listPullRequestReviewComments(prNumber: number): Promise<PullRequestReviewComment[]> {
    try {
      const { data } = await this.octokit.rest.pulls.listReviewComments({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        per_page: 100
      });

      return data.map(c => ({
        id: c.id,
        url: c.html_url ?? c.url,
        user: c.user?.login ?? 'unknown',
        body: c.body ?? '',
        path: c.path,
        line: (c as unknown as { line?: number | null }).line ?? null,
        side: (c as unknown as { side?: 'LEFT' | 'RIGHT' | null }).side ?? null,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list PR review comments: ${message}`);
    }
  }

  /**
   * Create an inline review comment on the PR.
   * Note: GitHub may require `position` for some diffs; this uses line+side when supported.
   */
  async createPullRequestReviewComment(
    prNumber: number,
    input: { body: string; path: string; line: number; side?: 'LEFT' | 'RIGHT' }
  ): Promise<{ id: number; url: string }>
  {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber
      });

      const commitId = pr.head.sha;

      type CreateReviewCommentParams = {
        owner: string;
        repo: string;
        pull_number: number;
        body: string;
        commit_id: string;
        path: string;
        line: number;
        side: 'LEFT' | 'RIGHT';
      };

      type CreateReviewCommentResult = {
        id: number;
        url: string;
        html_url?: string;
      };

      // Octokit types may lag behind GitHub API; use a narrow interface instead of `any`.
      const pullsApi = this.octokit.rest.pulls as unknown as {
        createReviewComment: (params: CreateReviewCommentParams) => Promise<{ data: CreateReviewCommentResult }>;
      };

      const { data: created } = await pullsApi.createReviewComment({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        body: input.body,
        commit_id: commitId,
        path: input.path,
        line: input.line,
        side: input.side ?? 'RIGHT'
      });

      return {
        id: created.id,
        url: created.html_url ?? created.url
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create PR review comment: ${message}`);
    }
  }

  /**
   * Approve a pull request by submitting a review.
   */
  async approvePullRequest(prNumber: number, body?: string): Promise<void> {
    try {
      await this.octokit.rest.pulls.createReview({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        body: body || undefined,
        event: 'APPROVE'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to approve PR: ${message}`);
    }
  }

  /**
   * Merge a pull request.
   */
  async mergePullRequest(
    prNumber: number,
    method: PullRequestMergeMethod = 'squash',
    commitTitle?: string,
    commitMessage?: string
  ): Promise<{ merged: boolean; message?: string; sha?: string }> {
    try {
      const { data } = await this.octokit.rest.pulls.merge({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        merge_method: method,
        commit_title: commitTitle,
        commit_message: commitMessage
      });

      return {
        merged: Boolean(data.merged),
        message: data.message,
        sha: data.sha
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to merge PR: ${message}`);
    }
  }

  /**
   * Build PR description from workflow outputs
   */
  private buildPRDescription(workflow: WorkflowRun): string {
    const summaries = workflow.steps
      .filter(s => s.status === 'completed' && s.output)
      .map(
        s =>
          `## ${s.roleId.toUpperCase()}\n\n${s.output?.substring(0, 500)}...\n`
      )
      .join('\n');

    return `# Generated by Digital Twin MVP

**Feature Request:** ${workflow.featureRequest}

**Workflow ID:** ${workflow.id}

**Generated:** ${workflow.createdAt}

## Agent Outputs

${summaries}

---

*This PR was auto-generated by the 9-agent AI development team. Please review carefully before merging.*`;
  }
}

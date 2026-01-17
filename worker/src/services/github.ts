// GitHub service for PR creation and artifact publishing
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { ArtifactR2Storage } from '../storage/artifacts-r2';

export class GitHubService {
  constructor(private env: {
    DB: D1Database;
    ARTIFACTS: R2Bucket;
    GITHUB_TOKEN: string;
  }) {}

  async createPR(workflowId: string, files: Record<string, string>): Promise<{ url: string; number: number }> {
    // Store files in R2
    const storage = new ArtifactR2Storage(this.env.ARTIFACTS);
    const artifactKey = await storage.storeWorkflowFiles(workflowId, files);

    // Create PR via GitHub API
    const response = await fetch('https://api.github.com/repos/example/repo/pulls', {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: `Workflow ${workflowId}`,
        head: `feature/${workflowId}`,
        base: 'main',
        body: `Artifacts stored at ${artifactKey}`
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const pr = await response.json();

    // Update workflow in D1
    await this.env.DB.prepare(
      `UPDATE workflows SET pr_number = ?, artifact_url = ? WHERE id = ?`
    ).bind(pr.number, artifactKey, workflowId).run();

    return { url: pr.html_url, number: pr.number };
  }
}

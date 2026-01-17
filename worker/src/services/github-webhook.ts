// GitHub webhook handler for PR events
import type { D1Database } from '@cloudflare/workers-types';

export class GitHubWebhookHandler {
  constructor(private env: { DB: D1Database }) {}

  async handleWebhook(event: any): Promise<void> {
    if (event.action === 'closed' && event.pull_request.merged) {
      const prNumber = event.pull_request.number;

      // Find workflow by PR number and update status
      await this.env.DB.prepare(
        `UPDATE workflows SET status = 'deployed' WHERE pr_number = ?`
      ).bind(prNumber).run();
    }
  }
}

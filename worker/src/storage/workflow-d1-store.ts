// D1 persistence helpers for workflows, steps, and audit events
import type { D1Database } from '@cloudflare/workers-types';

export class WorkflowD1Store {
  constructor(private db: D1Database) {}

  async createWorkflow(workflow: {
    id: string;
    featureRequest: string;
    status: string;
    createdAt: number;
    updatedAt: number;
  }) {
    await this.db.prepare(
      `INSERT INTO workflows (id, feature_request, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(
      workflow.id,
      workflow.featureRequest,
      workflow.status,
      workflow.createdAt,
      workflow.updatedAt
    ).run();
  }

  async updateWorkflowStatus(id: string, status: string, updatedAt: number) {
    await this.db.prepare(
      `UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?`
    ).bind(status, updatedAt, id).run();
  }

  async addStep(step: {
    workflowId: string;
    roleId: string;
    status: string;
    input?: string;
    output?: string;
    error?: string;
    startedAt?: number;
    finishedAt?: number;
  }) {
    await this.db.prepare(
      `INSERT INTO workflow_steps (workflow_id, role_id, status, input, output, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      step.workflowId,
      step.roleId,
      step.status,
      step.input ?? null,
      step.output ?? null,
      step.error ?? null,
      step.startedAt ?? null,
      step.finishedAt ?? null
    ).run();
  }

  async addAuditEvent(event: {
    workflowId: string;
    eventType: string;
    timestamp: number;
    data?: string;
  }) {
    await this.db.prepare(
      `INSERT INTO audit_events (workflow_id, event_type, timestamp, data) VALUES (?, ?, ?, ?)`
    ).bind(
      event.workflowId,
      event.eventType,
      event.timestamp,
      event.data ?? null
    ).run();
  }

  async getWorkflow(id: string) {
    return this.db.prepare(`SELECT * FROM workflows WHERE id = ?`).bind(id).first();
  }

  async getWorkflowSteps(workflowId: string) {
    return this.db.prepare(`SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY id ASC`).bind(workflowId).all();
  }

  async getAuditEvents(workflowId: string) {
    return this.db.prepare(`SELECT * FROM audit_events WHERE workflow_id = ? ORDER BY timestamp ASC`).bind(workflowId).all();
  }
}

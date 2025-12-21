export type AuditEventType =
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'quality.completed'
  | 'artifacts.publish.started'
  | 'artifacts.publish.completed'
  | 'artifacts.publish.failed'
  | 'deploy.trigger.requested'
  | 'deploy.trigger.rejected'
  | 'deploy.trigger.dispatched'
  | 'deploy.status.checked'
  | 'deploy.webhook.notified'
  | 'deploy.webhook.rollback';

export interface AuditEvent<T = unknown> {
  id: string;
  ts: string;
  type: AuditEventType;
  data?: T;
}

export interface AuditTrail {
  auditId: string;
  events: AuditEvent[];
}

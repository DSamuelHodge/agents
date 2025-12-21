import type { AuditEvent, AuditEventType } from './types';
import type { DurableObjectState } from '@cloudflare/workers-types';

export interface AuditStore {
  append(
    auditId: string,
    event: {
      type: AuditEventType;
      ts?: string;
      data?: unknown;
    }
  ): Promise<AuditEvent>;
  list(auditId: string): Promise<AuditEvent[]>;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function auditKey(auditId: string): string {
  return `audit:${auditId}`;
}

export class MemoryAuditStore implements AuditStore {
  private events = new Map<string, AuditEvent[]>();
  private maxEvents: number;

  constructor(options?: { maxEvents?: number }) {
    this.maxEvents = options?.maxEvents ?? 1000;
  }

  async append(
    auditId: string,
    event: { type: AuditEventType; ts?: string; data?: unknown }
  ): Promise<AuditEvent> {
    const ts = event.ts ?? new Date().toISOString();
    const next: AuditEvent = { id: makeId(), ts, type: event.type, data: event.data };
    const existing = this.events.get(auditId) ?? [];
    const updated = [...existing, next].slice(-this.maxEvents);
    this.events.set(auditId, updated);
    return next;
  }

  async list(auditId: string): Promise<AuditEvent[]> {
    return this.events.get(auditId) ?? [];
  }
}

export class DurableObjectAuditStore implements AuditStore {
  private maxEvents: number;

  constructor(private state: DurableObjectState, options?: { maxEvents?: number }) {
    this.maxEvents = options?.maxEvents ?? 1000;
  }

  async append(
    auditId: string,
    event: { type: AuditEventType; ts?: string; data?: unknown }
  ): Promise<AuditEvent> {
    const ts = event.ts ?? new Date().toISOString();
    const next: AuditEvent = { id: makeId(), ts, type: event.type, data: event.data };

    const key = auditKey(auditId);
    const existingRaw = await this.state.storage.get(key);
    const existing = existingRaw ? (JSON.parse(existingRaw as string) as AuditEvent[]) : [];
    const updated = [...existing, next].slice(-this.maxEvents);
    await this.state.storage.put(key, JSON.stringify(updated));

    return next;
  }

  async list(auditId: string): Promise<AuditEvent[]> {
    const key = auditKey(auditId);
    const raw = await this.state.storage.get(key);
    return raw ? (JSON.parse(raw as string) as AuditEvent[]) : [];
  }
}

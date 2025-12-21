import type { AuditEvent, AuditEventType } from './types';
import type { AuditStore } from './store';

type Fetchable = { fetch(request: Request): Promise<Response> };

export class DurableObjectAuditClient implements AuditStore {
  constructor(private stub: Fetchable) {}

  async append(
    auditId: string,
    event: { type: AuditEventType; ts?: string; data?: unknown }
  ): Promise<AuditEvent> {
    const resp = await this.stub.fetch(
      new Request('https://do.local/audit/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId, event })
      })
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Audit append failed: ${resp.status} ${text}`);
    }

    const json = (await resp.json()) as { ok: boolean; data?: AuditEvent; message?: string };
    if (!json.ok || !json.data) {
      throw new Error(json.message || 'Audit append failed');
    }

    return json.data;
  }

  async list(auditId: string): Promise<AuditEvent[]> {
    const resp = await this.stub.fetch(
      new Request(`https://do.local/audit?auditId=${encodeURIComponent(auditId)}`, {
        method: 'GET'
      })
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Audit list failed: ${resp.status} ${text}`);
    }

    const json = (await resp.json()) as { ok: boolean; data?: { events: AuditEvent[] }; message?: string };
    if (!json.ok || !json.data) {
      throw new Error(json.message || 'Audit list failed');
    }

    return json.data.events;
  }
}

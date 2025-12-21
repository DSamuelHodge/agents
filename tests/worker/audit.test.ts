import { describe, it, expect } from 'vitest';
import { MemoryAuditStore, DurableObjectAuditStore } from '@worker/audit';

function makeFakeState() {
  const map = new Map<string, string>();
  return {
    storage: {
      async get(key: string) {
        return map.get(key);
      },
      async put(key: string, value: string) {
        map.set(key, value);
      }
    }
  };
}

describe('E3-T004: Audit logging store', () => {
  it('MemoryAuditStore appends and lists events', async () => {
    const store = new MemoryAuditStore();

    await store.append('wf-1', { type: 'workflow.started', data: { feature: 'x' } });
    await store.append('wf-1', { type: 'step.started', data: { roleId: 'pm' } });

    const events = await store.list('wf-1');
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('workflow.started');
    expect(events[1]?.type).toBe('step.started');
  });

  it('DurableObjectAuditStore persists via state.storage', async () => {
    const fakeState = makeFakeState();
    const store = new DurableObjectAuditStore(fakeState as any);

    await store.append('wf-2', { type: 'workflow.started' });
    await store.append('wf-2', { type: 'workflow.completed', data: { ok: true } });

    const events = await store.list('wf-2');
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('workflow.started');
    expect(events[1]?.type).toBe('workflow.completed');
  });

  it('stores only the last N events when maxEvents is set', async () => {
    const store = new MemoryAuditStore({ maxEvents: 2 });

    await store.append('wf-3', { type: 'workflow.started' });
    await store.append('wf-3', { type: 'step.started' });
    await store.append('wf-3', { type: 'step.completed' });

    const events = await store.list('wf-3');
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('step.started');
    expect(events[1]?.type).toBe('step.completed');
  });
});

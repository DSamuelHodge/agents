import { describe, it, expect } from 'vitest';
import worker, { WorkflowCoordinator } from '../../worker/src/index';

type StorageLike = {
  get: (key: string) => Promise<unknown>;
  put: (key: string, value: string) => Promise<void>;
};

function makeDurableObjectState(): { storage: StorageLike } {
  const data = new Map<string, string>();
  return {
    storage: {
      async get(key: string) {
        return data.get(key);
      },
      async put(key: string, value: string) {
        data.set(key, value);
      }
    }
  };
}

function makeWorkflowDoNamespace() {
  const instances = new Map<string, WorkflowCoordinator>();

  return {
    idFromName(name: string) {
      return name;
    },
    get(id: unknown) {
      const key = String(id);
      let instance = instances.get(key);
      if (!instance) {
        instance = new WorkflowCoordinator(makeDurableObjectState() as any);
        instances.set(key, instance);
      }
      return {
        fetch(request: Request) {
          return instance!.fetch(request);
        }
      };
    }
  };
}

describe('E4-T004: Settings endpoints', () => {
  it('GET /settings returns defaults and persists updates via PUT', async () => {
    const env: Record<string, unknown> = {
      WORKFLOW_DO: makeWorkflowDoNamespace(),
      GITHUB_OWNER: 'acme',
      GITHUB_REPO: 'generated',
      ENVIRONMENT: 'staging'
    };

    const get1 = await worker.fetch(new Request('http://local/settings', { method: 'GET' }), env as any);
    expect(get1.status).toBe(200);
    const payload1 = (await get1.json()) as any;
    expect(payload1.ok).toBe(true);
    expect(payload1.data.github.owner).toBe('acme');
    expect(payload1.data.github.repo).toBe('generated');
    expect(payload1.data.autoMerge).toBe(false);
    expect(payload1.data.requiredApprovals).toBeGreaterThan(0);
    expect(payload1.data.deploymentEnvironment).toBe('staging');

    const put = await worker.fetch(
      new Request('http://local/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github: { owner: 'octo-org', repo: 'octo-repo' },
          autoMerge: true,
          requiredApprovals: 2,
          requiredReviewers: ['alice', 'bob'],
          deploymentEnvironment: 'production'
        })
      }),
      env as any
    );

    expect(put.status).toBe(200);
    const payload2 = (await put.json()) as any;
    expect(payload2.ok).toBe(true);
    expect(payload2.data.github.owner).toBe('octo-org');
    expect(payload2.data.github.repo).toBe('octo-repo');
    expect(payload2.data.autoMerge).toBe(true);
    expect(payload2.data.requiredApprovals).toBe(2);
    expect(payload2.data.requiredReviewers).toEqual(['alice', 'bob']);
    expect(payload2.data.deploymentEnvironment).toBe('production');

    const get2 = await worker.fetch(new Request('http://local/settings', { method: 'GET' }), env as any);
    const payload3 = (await get2.json()) as any;
    expect(payload3.ok).toBe(true);
    expect(payload3.data.github.owner).toBe('octo-org');
    expect(payload3.data.github.repo).toBe('octo-repo');
    expect(payload3.data.autoMerge).toBe(true);
    expect(payload3.data.requiredApprovals).toBe(2);
    expect(payload3.data.requiredReviewers).toEqual(['alice', 'bob']);
    expect(payload3.data.deploymentEnvironment).toBe('production');
  });
});

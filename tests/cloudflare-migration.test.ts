// Comprehensive test suite for Cloudflare-native migration
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowD1Store } from '../worker/src/storage/workflow-d1-store';
import { ArtifactR2Storage } from '../worker/src/storage/artifacts-r2';
import { AgentKVCache } from '../worker/src/cache/agent-kv-cache';
import { GitHubService } from '../worker/src/services/github';
import { GitHubWebhookHandler } from '../worker/src/services/github-webhook';

// Mock Cloudflare bindings
const mockStmt = {
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue(undefined)
};

const mockDB = {
  prepare: vi.fn().mockReturnValue(mockStmt),
  first: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue({ results: [] })
};

const mockBucket = {
  put: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null)
};

const mockKV = {
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined)
};

describe('WorkflowD1Store', () => {
  let store: WorkflowD1Store;

  beforeEach(() => {
    store = new WorkflowD1Store(mockDB as any);
    vi.clearAllMocks();
  });

  it('creates workflow successfully', async () => {
    const workflow = {
      id: 'test-123',
      featureRequest: 'Build a todo app',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await store.createWorkflow(workflow);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      'INSERT INTO workflows (id, feature_request, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    expect(mockStmt.bind).toHaveBeenCalledWith(
      workflow.id,
      workflow.featureRequest,
      workflow.status,
      workflow.createdAt,
      workflow.updatedAt
    );
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it('updates workflow status', async () => {
    const updatedAt = Date.now();
    await store.updateWorkflowStatus('test-123', 'completed', updatedAt);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      'UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?'
    );
    expect(mockStmt.bind).toHaveBeenCalledWith('completed', updatedAt, 'test-123');
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it('adds workflow step', async () => {
    const step = {
      workflowId: 'test-123',
      roleId: 'pm',
      status: 'completed',
      output: 'Analysis complete'
    };

    await store.addStep(step);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      'INSERT INTO workflow_steps (workflow_id, role_id, status, input, output, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    expect(mockStmt.bind).toHaveBeenCalledWith(
      step.workflowId,
      step.roleId,
      step.status,
      step.input ?? null,
      step.output ?? null,
      step.error ?? null,
      step.startedAt ?? null,
      step.finishedAt ?? null
    );
    expect(mockStmt.run).toHaveBeenCalled();
  });
});

describe('ArtifactR2Storage', () => {
  let storage: ArtifactR2Storage;

  beforeEach(() => {
    storage = new ArtifactR2Storage(mockBucket as any);
    vi.clearAllMocks();
  });

  it('stores workflow files', async () => {
    const files = { 'README.md': '# Test', 'package.json': '{}' };

    const key = await storage.storeWorkflowFiles('test-123', files);

    expect(key).toContain('workflows/test-123/artifacts.tar.gz');
    // Accept either ArrayBuffer or Uint8Array for the tarball argument
    const callArgs = mockBucket.put.mock.calls[0];
    expect(callArgs[0]).toBe(key);
    // Accept Uint8Array or ArrayBuffer
    expect(
      callArgs[1] instanceof ArrayBuffer || callArgs[1] instanceof Uint8Array
    ).toBe(true);
    expect(callArgs[2]).toEqual(
      expect.objectContaining({
        httpMetadata: { contentType: 'application/gzip' }
      })
    );
  });

  it('retrieves workflow files', async () => {
    // Prepare a valid JSON tarball as Uint8Array, matching compressFiles
    const testFiles = { 'README.md': '# Test', 'package.json': '{}' };
    const encoder = new TextEncoder();
    const tarball = encoder.encode(JSON.stringify(testFiles));
    const mockObject = { arrayBuffer: vi.fn().mockResolvedValue(tarball) };
    mockBucket.get.mockResolvedValue(mockObject);

    const files = await storage.getWorkflowFiles('test-123');

    expect(mockBucket.get).toHaveBeenCalledWith('workflows/test-123/artifacts.tar.gz');
    expect(files).toEqual(testFiles);
  });
});

describe('AgentKVCache', () => {
  let cache: AgentKVCache;

  beforeEach(() => {
    cache = new AgentKVCache(mockKV as any);
    vi.clearAllMocks();
  });

  it('returns cached response', async () => {
    mockKV.get.mockResolvedValue('cached response');

    const result = await cache.getCachedResponse('pm', 'test input');

    expect(result).toBe('cached response');
    expect(mockKV.get).toHaveBeenCalled();
  });

  it('caches new response', async () => {
    await cache.setCachedResponse('pm', 'test input', 'new response');

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.any(String),
      'new response',
      { expirationTtl: 3600 }
    );
  });
});

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    service = new GitHubService({
      DB: mockDB as any,
      ARTIFACTS: mockBucket as any,
      GITHUB_TOKEN: 'test-token'
    } as any);
    vi.clearAllMocks();
  });

  it('creates PR with artifacts', async () => {
    const files = { 'README.md': '# Test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html_url: 'https://github.com/pr/1', number: 1 })
    });

    const result = await service.createPR('test-123', files);

    expect(result.url).toBe('https://github.com/pr/1');
    expect(result.number).toBe(1);
    expect(mockBucket.put).toHaveBeenCalled();
    expect(mockDB.prepare).toHaveBeenCalled();
  });
});

describe('GitHubWebhookHandler', () => {
  let handler: GitHubWebhookHandler;

  beforeEach(() => {
    handler = new GitHubWebhookHandler({ DB: mockDB as any });
    vi.clearAllMocks();
  });

  it('handles PR merged event', async () => {
    const event = {
      action: 'closed',
      pull_request: { number: 123, merged: true, state: 'closed' },
      repository: { name: 'test', owner: { login: 'user' } }
    };

    await handler.handleWebhook(event);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workflows SET status = \'deployed\'')
    );
  });
});
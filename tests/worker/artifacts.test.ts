import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractCode,
  generateProjectStructure,
  createREADME,
  validateProjectStructure
} from '@worker/artifacts/generator';
import type { WorkflowRun } from '@worker/utils/types';

const githubMocks = vi.hoisted(() => {
  return {
    validateToken: vi.fn<() => Promise<boolean>>(),
    setBranchProtection: vi.fn<(_settings: unknown) => Promise<void>>(),
    createBranch: vi.fn<(_workflowId: string) => Promise<string>>(),
    commitFiles: vi.fn<
      (_branchName: string, _files: Record<string, string>, _message: string) => Promise<string>
    >(),
    createPullRequest: vi.fn<
      (_branchName: string, _workflow: WorkflowRun) => Promise<{ url: string; number: number; branch: string }>
    >(),
    enableAutoMerge: vi.fn<(_prNumber: number, _method?: unknown) => Promise<void>>(),
    postPRComment: vi.fn<(_prNumber: number, _comment: string) => Promise<void>>(),
    getPRStatus: vi.fn<
      (_prNumber: number) => Promise<{ state: 'open' | 'closed' | 'merged'; merged: boolean; approvals: number }>
    >()
  };
});

vi.mock('@worker/utils/github', () => {
  class GitHubClient {
    validateToken = githubMocks.validateToken;
    setBranchProtection = githubMocks.setBranchProtection;
    createBranch = githubMocks.createBranch;
    commitFiles = githubMocks.commitFiles;
    createPullRequest = githubMocks.createPullRequest;
    enableAutoMerge = githubMocks.enableAutoMerge;
    postPRComment = githubMocks.postPRComment;
    getPRStatus = githubMocks.getPRStatus;

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(_config: unknown) {}
  }

  return { GitHubClient };
});

function makeWorkflow(overrides?: Partial<WorkflowRun>): WorkflowRun {
  const now = new Date('2025-12-13T00:00:00.000Z').toISOString();
  return {
    id: 'wf-123',
    featureRequest: 'Build a tiny todo app',
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    steps: [],
    ...overrides
  };
}

describe('E1-T006: Artifacts generation + GitHub publishing', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    githubMocks.validateToken.mockResolvedValue(true);
    githubMocks.setBranchProtection.mockResolvedValue(undefined);
    githubMocks.createBranch.mockResolvedValue('agents/workflow-wf-123');
    githubMocks.commitFiles.mockResolvedValue('commit-sha');
    githubMocks.createPullRequest.mockResolvedValue({
      url: 'https://github.com/acme/generated/pull/1',
      number: 1,
      branch: 'agents/workflow-wf-123'
    });
    githubMocks.enableAutoMerge.mockResolvedValue(undefined);
    githubMocks.postPRComment.mockResolvedValue(undefined);
    githubMocks.getPRStatus.mockResolvedValue({ state: 'open', merged: false, approvals: 0 });
  });

  describe('extractCode()', () => {
    it('extracts code blocks and preserves language', () => {
      const text = [
        'Here is code:',
        '```typescript',
        'export const x = 1;',
        '```',
        '```python',
        'print("hi")',
        '```'
      ].join('\n');

      const blocks = extractCode(text);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].language).toBe('typescript');
      expect(blocks[0].code).toBe('export const x = 1;');
      expect(blocks[1].language).toBe('python');
      expect(blocks[1].code).toBe('print("hi")');
    });

    it('filters by language when provided', () => {
      const text = [
        '```typescript',
        'export const x = 1;',
        '```',
        '```python',
        'print("hi")',
        '```'
      ].join('\n');

      const tsBlocks = extractCode(text, 'typescript');
      expect(tsBlocks).toHaveLength(1);
      expect(tsBlocks[0].language).toBe('typescript');
    });

    it('treats missing language as text', () => {
      const text = ['```', 'no lang', '```'].join('\n');
      const blocks = extractCode(text);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe('text');
      expect(blocks[0].code).toBe('no lang');
    });
  });

  describe('generateProjectStructure()', () => {
    it('maps role outputs into expected files', () => {
      const workflow = makeWorkflow({
        steps: [
          {
            roleId: 'backend',
            status: 'completed',
            input: 'n/a',
            output: [
              '```python',
              'print("backend")',
              '```',
              '```typescript',
              'export const api = true;',
              '```'
            ].join('\n')
          },
          {
            roleId: 'frontend',
            status: 'completed',
            input: 'n/a',
            output: [
              '```tsx',
              'export function App(){ return null; }',
              '```',
              '```css',
              '.root{}',
              '```'
            ].join('\n')
          },
          {
            roleId: 'database',
            status: 'completed',
            input: 'n/a',
            output: ['```sql', 'CREATE TABLE t(id INT);', '```'].join('\n')
          },
          {
            roleId: 'qa',
            status: 'completed',
            input: 'n/a',
            output: ['```python', 'def test_ok():\n  assert True', '```'].join('\n')
          },
          {
            roleId: 'devops',
            status: 'completed',
            input: 'n/a',
            output: [
              '```dockerfile',
              'FROM node:20',
              '```',
              '```yaml',
              'services: {}',
              '```'
            ].join('\n')
          },
          {
            roleId: 'architect',
            status: 'completed',
            input: 'n/a',
            output: '# Architecture\nSome notes'
          },
          {
            roleId: 'tech_writer',
            status: 'completed',
            input: 'n/a',
            output: '# Docs\nHow to run'
          }
        ]
      });

      const files = generateProjectStructure(workflow);

      expect(files['backend/main.py']).toBe('print("backend")');
      expect(files['backend/index.ts']).toBe('export const api = true;');
      expect(files['src/App.tsx']).toBe('export function App(){ return null; }');
      expect(files['src/App.css']).toBe('.root{}');
      expect(files['db/schema.sql']).toBe('CREATE TABLE t(id INT);');
      expect(files['tests/test_main.py']).toContain('def test_ok');
      expect(files['Dockerfile']).toBe('FROM node:20');
      expect(files['docker-compose.yml']).toBe('services: {}');
      expect(files['docs/ARCHITECTURE.md']).toContain('# Architecture');
      expect(files['docs/README.md']).toContain('# Docs');
    });
  });

  describe('createREADME() + validateProjectStructure()', () => {
    it('creates a README containing workflow metadata and role excerpts', () => {
      const longPm = 'p'.repeat(800);
      const longArch = 'a'.repeat(800);
      const workflow = makeWorkflow({
        steps: [
          { roleId: 'pm', status: 'completed', input: 'n/a', output: longPm },
          { roleId: 'architect', status: 'completed', input: 'n/a', output: longArch }
        ]
      });

      const readme = createREADME(workflow);
      expect(readme).toContain(`# ${workflow.featureRequest}`);
      expect(readme).toContain(`Workflow ID: ${workflow.id}`);
      expect(readme).toContain(workflow.createdAt);
      expect(readme).toContain('## Overview');
      expect(readme).toContain(longPm.substring(0, 500));
      expect(readme).toContain('## Architecture');
      expect(readme).toContain(longArch.substring(0, 500));
    });

    it('flags missing README and missing code files', () => {
      const result = validateProjectStructure({
        'docs/ARCHITECTURE.md': 'hello'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.join('\n')).toContain('Missing README');
      expect(result.errors.join('\n')).toContain('No source code files generated');
    });

    it('flags TODO comments in generated files', () => {
      const result = validateProjectStructure({
        'README.md': 'ok',
        'src/index.ts': '// TODO: fix me\nexport {}'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('contains TODO'))).toBe(true);
    });
  });

  describe('ArtifactManager.generateAndPublish()', () => {
    it('publishes a PR and commits generated files (mocked)', async () => {
      const { ArtifactManager } = await import('@worker/artifacts/manager');
      const manager = new ArtifactManager({
        githubToken: 'ghp_x',
        githubOwner: 'acme',
        githubRepo: 'generated'
      });

      const workflow = makeWorkflow({
        steps: [
          {
            roleId: 'backend',
            status: 'completed',
            input: 'n/a',
            output: ['```typescript', 'export const ok = true;', '```'].join('\n')
          }
        ]
      });

      const pr = await manager.generateAndPublish(workflow);

      expect(pr.url).toContain('github.com');
      expect(pr.number).toBe(1);
      expect(pr.branch).toBe('agents/workflow-wf-123');

      expect(githubMocks.validateToken).toHaveBeenCalledTimes(1);
      expect(githubMocks.createBranch).toHaveBeenCalledWith('wf-123');
      expect(githubMocks.commitFiles).toHaveBeenCalledTimes(1);

      const committedFiles = githubMocks.commitFiles.mock.calls[0]?.[1] as Record<string, string>;
      expect(committedFiles['README.md']).toBeTruthy();
      expect(Object.keys(committedFiles).some(p => p.endsWith('.ts'))).toBe(true);

      expect(githubMocks.createPullRequest).toHaveBeenCalledTimes(1);
      expect(githubMocks.postPRComment).not.toHaveBeenCalled();
    });

    it('posts a PR comment when validation finds issues (e.g., TODOs)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const { ArtifactManager } = await import('@worker/artifacts/manager');

      const manager = new ArtifactManager({
        githubToken: 'ghp_x',
        githubOwner: 'acme',
        githubRepo: 'generated'
      });

      const workflow = makeWorkflow({
        steps: [
          {
            roleId: 'backend',
            status: 'completed',
            input: 'n/a',
            output: ['```typescript', '// TODO: remove', 'export const ok = true;', '```'].join('\n')
          }
        ]
      });

      await manager.generateAndPublish(workflow);

      expect(warnSpy).toHaveBeenCalled();
      expect(githubMocks.postPRComment).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('throws a helpful error for invalid/expired token', async () => {
      githubMocks.validateToken.mockRejectedValue(new Error('401 Unauthorized'));

      const { ArtifactManager } = await import('@worker/artifacts/manager');

      const manager = new ArtifactManager({
        githubToken: 'bad',
        githubOwner: 'acme',
        githubRepo: 'generated'
      });

      await expect(manager.generateAndPublish(makeWorkflow())).rejects.toThrow(
        /401 Unauthorized/
      );
    });

    it('throws a helpful error on rate limiting / API failures', async () => {
      githubMocks.createBranch.mockRejectedValue(new Error('API rate limit exceeded'));

      const { ArtifactManager } = await import('@worker/artifacts/manager');

      const manager = new ArtifactManager({
        githubToken: 'ghp_x',
        githubOwner: 'acme',
        githubRepo: 'generated'
      });

      const workflow = makeWorkflow({
        steps: [
          {
            roleId: 'backend',
            status: 'completed',
            input: 'n/a',
            output: ['```typescript', 'export const ok = true;', '```'].join('\n')
          }
        ]
      });

      await expect(manager.generateAndPublish(workflow)).rejects.toThrow(
        /rate limit/i
      );
    });

    it('optionally applies branch protection and enables auto-merge when configured', async () => {
      const { ArtifactManager } = await import('@worker/artifacts/manager');
      const manager = new ArtifactManager({
        githubToken: 'ghp_x',
        githubOwner: 'acme',
        githubRepo: 'generated',
        branchProtection: {
          enabled: true,
          branch: 'main',
          requiredStatusChecks: { strict: true, contexts: ['build-test'] },
          requiredApprovingReviewCount: 1
        },
        autoMerge: { enabled: true, method: 'squash' }
      });

      const workflow = makeWorkflow({
        steps: [
          {
            roleId: 'backend',
            status: 'completed',
            input: 'n/a',
            output: ['```typescript', 'export const ok = true;', '```'].join('\n')
          }
        ]
      });

      await manager.generateAndPublish(workflow);

      expect(githubMocks.setBranchProtection).toHaveBeenCalledTimes(1);
      expect(githubMocks.enableAutoMerge).toHaveBeenCalledWith(1, 'squash');
    });
  });
});

import type { ValidationIssue } from '../validation/linter';

export type FixRoleId =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'devops'
  | 'qa'
  | 'tech_writer'
  | 'architect'
  | 'pm'
  | 'project_mgr';

export interface FixRequest {
  roleId: FixRoleId;
  filePaths: string[];
  issues: ValidationIssue[];
  prompt: string;
}

function roleForFilePath(filePath: string): FixRoleId {
  if (filePath.startsWith('src/')) return 'frontend';
  if (filePath.startsWith('backend/')) return 'backend';
  if (filePath.startsWith('db/')) return 'database';
  if (filePath.startsWith('docs/')) return 'tech_writer';
  if (filePath.startsWith('tests/')) return 'qa';
  if (filePath === 'Dockerfile' || filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    return 'devops';
  }
  return 'backend';
}

function buildPrompt(roleId: FixRoleId, issues: ValidationIssue[]): string {
  const issueList = issues
    .slice(0, 25)
    .map(i => `- [${i.severity}] ${i.filePath}: ${i.message}`)
    .join('\n');

  return [
    `You are the ${roleId} role.`,
    'Fix the following validation issues in the provided files.',
    'Return ONLY markdown code blocks for the updated files.',
    'Use one code block per file, and start each block with the file path on the first line as a comment.',
    '',
    'Issues:',
    issueList
  ].join('\n');
}

/**
 * Groups validation issues into fix requests per role.
 * Note: execution of these requests (calling the LLM) is intentionally NOT done here.
 */
export function buildFixRequests(issues: ValidationIssue[]): FixRequest[] {
  const byRole = new Map<FixRoleId, Map<string, ValidationIssue[]>>();

  for (const issue of issues) {
    if (issue.severity !== 'error') continue;
    const roleId = roleForFilePath(issue.filePath);
    const roleMap = byRole.get(roleId) ?? new Map<string, ValidationIssue[]>();
    const list = roleMap.get(issue.filePath) ?? [];
    list.push(issue);
    roleMap.set(issue.filePath, list);
    byRole.set(roleId, roleMap);
  }

  const requests: FixRequest[] = [];
  for (const [roleId, fileMap] of byRole.entries()) {
    const roleIssues: ValidationIssue[] = [];
    const filePaths = Array.from(fileMap.keys());
    for (const issuesForFile of fileMap.values()) roleIssues.push(...issuesForFile);

    requests.push({
      roleId,
      filePaths,
      issues: roleIssues,
      prompt: buildPrompt(roleId, roleIssues)
    });
  }

  return requests;
}

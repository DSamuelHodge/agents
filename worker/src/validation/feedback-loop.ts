import type { ValidationIssue } from './linter';

export interface ParsedFileUpdate {
  filePath: string;
  content: string;
  language: string;
}

const CODE_BLOCK_RE = /```(\w*)\n([\s\S]*?)```/g;

function normalizePathHint(line: string): string {
  const trimmed = line.trim();

  // Common comment wrappers
  const withoutSlashes = trimmed.replace(/^\/\/\s*/, '');
  const withoutHash = withoutSlashes.replace(/^#\s*/, '');
  const withoutBlock = withoutHash.replace(/^\/\*+\s*/, '').replace(/\*\/\s*$/, '');
  const withoutHtml = withoutBlock.replace(/^<!--\s*/, '').replace(/\s*-->$/, '');

  const cleaned = withoutHtml.trim();

  // Accept "path: foo" or "file: foo"
  const m = cleaned.match(/^(path|file)\s*:\s*(.+)$/i);
  if (m?.[2]) return m[2].trim();
  return cleaned;
}

export function parseFileUpdatesFromAgentOutput(text: string): ParsedFileUpdate[] {
  const updates: ParsedFileUpdate[] = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_RE.exec(text)) !== null) {
    const language = match[1] || 'text';
    const raw = match[2] || '';

    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const first = lines[0] ?? '';
    const filePath = normalizePathHint(first);

    if (!filePath || filePath.length > 200 || filePath.includes(' ')) {
      // If no clear file path hint, skip this block.
      continue;
    }

    const content = lines.slice(1).join('\n').trimEnd();
    if (!content) continue;

    updates.push({ filePath, content, language });
  }

  return updates;
}

export function applyFileUpdates(
  files: Record<string, string>,
  updates: ParsedFileUpdate[]
): { files: Record<string, string>; updated: string[] } {
  const next = { ...files };
  const updated: string[] = [];

  for (const update of updates) {
    next[update.filePath] = update.content;
    updated.push(update.filePath);
  }

  return { files: next, updated };
}

export function errorIssuesOnly(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter(i => i.severity === 'error');
}

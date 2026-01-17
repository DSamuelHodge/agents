// Skip TypeScript transpile in Worker runtime; rely on build pipeline instead.
import type { ValidationIssue } from './linter';

export interface TestValidationResult {
  issues: ValidationIssue[];
  testFiles: string[];
  coverageEstimate: number; // 0-100 heuristic
}

function isTestFile(filePath: string): boolean {
  return (
    /(^|\/)(__tests__|tests)\//.test(filePath) ||
    filePath.endsWith('.test.ts') ||
    filePath.endsWith('.test.tsx') ||
    filePath.endsWith('.spec.ts') ||
    filePath.endsWith('.spec.tsx') ||
    filePath.endsWith('.test.js') ||
    filePath.endsWith('.spec.js')
  );
}

function isCodeFile(filePath: string): boolean {
  return (
    filePath.endsWith('.ts') ||
    filePath.endsWith('.tsx') ||
    filePath.endsWith('.js') ||
    filePath.endsWith('.jsx') ||
    filePath.endsWith('.py')
  );
}

function validatePython(filePath: string, content: string): ValidationIssue[] {
  if (!filePath.endsWith('.py')) return [];

  const issues: ValidationIssue[] = [];

  // Very lightweight sanity checks (no Python runtime available)
  if (content.includes('```')) {
    issues.push({
      tool: 'python',
      severity: 'warning',
      filePath,
      message: 'Python file appears to contain markdown code fences.'
    });
  }

  return issues;
}

function validateTsJs(filePath: string, content: string): ValidationIssue[] {
  if (
    !filePath.endsWith('.ts') &&
    !filePath.endsWith('.tsx') &&
    !filePath.endsWith('.js') &&
    !filePath.endsWith('.jsx')
  ) {
    return [];
  }
  // Skip TS/JS diagnostics in Worker runtime.
  return [];
}

function coverageHeuristic(testFileCount: number, codeFileCount: number): number {
  if (codeFileCount === 0) return 0;
  if (testFileCount === 0) return 10;
  const ratio = testFileCount / Math.max(1, codeFileCount);

  // Very rough heuristic: more tests per code file => higher estimate.
  const estimate = 30 + Math.min(70, Math.round(ratio * 140));
  return Math.max(0, Math.min(100, estimate));
}

export function validateTestsAndSyntax(
  files: Record<string, string>
): TestValidationResult {
  const issues: ValidationIssue[] = [];

  const testFiles = Object.keys(files).filter(isTestFile);
  const codeFiles = Object.keys(files).filter(isCodeFile);

  for (const [filePath, content] of Object.entries(files)) {
    issues.push(...validateTsJs(filePath, content));
    issues.push(...validatePython(filePath, content));
  }

  const coverageEstimate = coverageHeuristic(testFiles.length, codeFiles.length);

  return {
    issues,
    testFiles,
    coverageEstimate
  };
}

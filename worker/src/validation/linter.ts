// TypeScript compiler API is not supported in Cloudflare Workers runtime.
// Skip TS diagnostics in-worker; rely on build/typecheck pipeline instead.

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  tool: 'prettier' | 'typescript' | 'sql' | 'json' | 'yaml' | 'python' | 'project';
  severity: IssueSeverity;
  filePath: string;
  message: string;
  ruleId?: string;
}

export interface LintResult {
  files: Record<string, string>;
  issues: ValidationIssue[];
  formattedFiles: number;
}

function prettierParserForPath(filePath: string): string | undefined {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'babel';
  if (filePath.endsWith('.css')) return 'css';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) return 'yaml';
  if (filePath.endsWith('.md')) return 'markdown';
  return undefined;
}

async function formatWithPrettier(
  filePath: string,
  content: string
): Promise<{ formatted?: string; issue?: ValidationIssue }> {
  const parser = prettierParserForPath(filePath);
  if (!parser) return {};

  try {
    const prettier = await import('prettier/standalone');
    const plugins: unknown[] = [];

    // Load only what we might need.
    if (parser === 'typescript') {
      plugins.push((await import('prettier/plugins/typescript')).default);
      plugins.push((await import('prettier/plugins/estree')).default);
    } else if (parser === 'babel' || parser === 'json') {
      plugins.push((await import('prettier/plugins/babel')).default);
      plugins.push((await import('prettier/plugins/estree')).default);
    } else if (parser === 'css') {
      plugins.push((await import('prettier/plugins/postcss')).default);
    } else if (parser === 'yaml') {
      plugins.push((await import('prettier/plugins/yaml')).default);
    } else if (parser === 'markdown') {
      plugins.push((await import('prettier/plugins/markdown')).default);
    }

    const formatted = await prettier.format(content, {
      parser,
      plugins: plugins as unknown
    });

    return { formatted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      issue: {
        tool: 'prettier',
        severity: 'warning',
        filePath,
        message: `Prettier failed: ${message}`
      }
    };
  }
}

async function formatSql(
  filePath: string,
  content: string
): Promise<{ formatted?: string; issue?: ValidationIssue }> {
  if (!filePath.endsWith('.sql')) return {};

  try {
    // sql-formatter is ESM friendly and works without Node APIs.
    const mod = await import('sql-formatter');
    const format = (mod as unknown as { format: (sql: string) => string }).format;
    return { formatted: format(content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      issue: {
        tool: 'sql',
        severity: 'warning',
        filePath,
        message: `SQL formatter failed: ${message}`
      }
    };
  }
}

function validateJson(filePath: string, content: string): ValidationIssue | undefined {
  if (!filePath.endsWith('.json')) return undefined;
  try {
    JSON.parse(content);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tool: 'json', severity: 'error', filePath, message: `Invalid JSON: ${message}` };
  }
}

async function validateYaml(filePath: string, content: string): Promise<ValidationIssue | undefined> {
  if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) return undefined;
  try {
    const { parse } = await import('yaml');
    parse(content);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tool: 'yaml', severity: 'error', filePath, message: `Invalid YAML: ${message}` };
  }
}

function validateTypeScript(): ValidationIssue[] {
  // Skip TS validation in Worker runtime
  return [];
}

export async function lintAndFormatProject(
  inputFiles: Record<string, string>
): Promise<LintResult> {
  const issues: ValidationIssue[] = [];
  const files: Record<string, string> = { ...inputFiles };
  let formattedFiles = 0;

  for (const [filePath, original] of Object.entries(inputFiles)) {
    // JSON/YAML validation
    const jsonIssue = validateJson(filePath, original);
    if (jsonIssue) issues.push(jsonIssue);

    const yamlIssue = await validateYaml(filePath, original);
    if (yamlIssue) issues.push(yamlIssue);

    // TypeScript/JS syntax diagnostics (via TS)
    issues.push(...validateTypeScript());

    // Formatting (best-effort)
    const sqlFormatted = await formatSql(filePath, original);
    if (sqlFormatted.issue) issues.push(sqlFormatted.issue);
    if (sqlFormatted.formatted && sqlFormatted.formatted !== original) {
      files[filePath] = sqlFormatted.formatted;
      formattedFiles++;
      continue;
    }

    const prettierFormatted = await formatWithPrettier(filePath, original);
    if (prettierFormatted.issue) issues.push(prettierFormatted.issue);
    if (prettierFormatted.formatted && prettierFormatted.formatted !== original) {
      files[filePath] = prettierFormatted.formatted;
      formattedFiles++;
    }
  }

  return { files, issues, formattedFiles };
}

// Dedicated Validation Worker
import prettier from 'prettier/standalone';
import * as prettierPlugins from 'prettier/plugins';

export interface ValidationRequest {
  files: Record<string, string>;
  type: 'lint' | 'format' | 'quality';
}

export interface ValidationResponse {
  passed: boolean;
  results: Record<string, unknown>;
  errors?: string[];
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { files, type }: ValidationRequest = await request.json();

      switch (type) {
        case 'lint':
          return Response.json(await this.lintFiles(files));
        case 'format':
          return Response.json(await this.formatFiles(files));
        case 'quality':
          return Response.json(await this.checkQuality(files));
        default:
          return new Response('Invalid validation type', { status: 400 });
      }
    } catch (error) {
      return Response.json({
        passed: false,
        results: {},
        errors: [error instanceof Error ? error.message : String(error)]
      }, { status: 500 });
    }
  },

  async lintFiles(files: Record<string, string>): Promise<ValidationResponse> {
    // Simplified linting - in production, use ESLint or similar
    const errors: string[] = [];
    for (const [path, content] of Object.entries(files)) {
      if (content.includes('any')) {
        errors.push(`${path}: Avoid using 'any' type`);
      }
    }
    return {
      passed: errors.length === 0,
      results: { errors },
      errors
    };
  },

  async formatFiles(files: Record<string, string>): Promise<ValidationResponse> {
    const formatted: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      try {
        formatted[path] = await prettier.format(content, {
          parser: this.inferParser(path),
          plugins: prettierPlugins
        });
      } catch {
        formatted[path] = content; // Keep original if formatting fails
      }
    }
    return {
      passed: true,
      results: { formatted }
    };
  },

  async checkQuality(files: Record<string, string>): Promise<ValidationResponse> {
    const lintResult = await this.lintFiles(files);
    const formatResult = await this.formatFiles(files);

    const score = this.calculateQualityScore(lintResult, formatResult, files);

    return {
      passed: score >= 80 && lintResult.passed,
      results: {
        score,
        lint: lintResult.results,
        format: formatResult.results
      }
    };
  },

  inferParser(path: string): string {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'babel';
    if (path.endsWith('.json')) return 'json';
    return 'babel'; // default
  },

  calculateQualityScore(
    lint: ValidationResponse,
    format: ValidationResponse,
    files: Record<string, string>
  ): number {
    const lintScore = lint.passed ? 100 : Math.max(0, 100 - lint.results.errors.length * 10);
    const formatScore = 100; // Assume formatting always passes for now
    const fileCount = Object.keys(files).length;
    const sizeScore = Math.min(100, fileCount * 10); // Bonus for more files

    return Math.round((lintScore + formatScore + sizeScore) / 3);
  }
};
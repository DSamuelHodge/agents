import type { WorkflowRun, CodeQualitySummary } from '../utils/types';
import {
  generateProjectStructure,
  createREADME,
  validateProjectStructure
} from './generator';
import {
  lintAndFormatProject,
  type ValidationIssue
} from '../validation/linter';
import { validateTestsAndSyntax } from '../validation/tester';
import { AGENTS_WORKFLOW_YML } from './github-actions';

export interface ArtifactBuildResult {
  files: Record<string, string>;
  quality: CodeQualitySummary;
}

function mapStructureErrors(errors: string[]): ValidationIssue[] {
  return errors.map((message) => ({
    tool: 'project',
    severity: message.includes('contains TODO') ? 'warning' : 'error',
    filePath: 'project',
    message
  }));
}

function scoreFromIssues(issues: Array<Pick<ValidationIssue, 'severity'>>): { score: number; errors: number; warnings: number } {
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;

  const score = Math.max(0, Math.min(100, 100 - errors * 12 - warnings * 3));
  return { score, errors, warnings };
}

export async function validateArtifacts(files: Record<string, string>): Promise<ArtifactBuildResult> {
  const linted = await lintAndFormatProject(files);
  const testValidation = validateTestsAndSyntax(linted.files);

  const allIssues: ValidationIssue[] = [...linted.issues, ...testValidation.issues];
  const { score, errors, warnings } = scoreFromIssues(allIssues);

  return {
    files: linted.files,
    quality: {
      score,
      errors,
      warnings,
      formattedFiles: linted.formattedFiles,
      coverageEstimate: testValidation.coverageEstimate,
      issues: allIssues.map(i => ({
        tool: i.tool,
        severity: i.severity,
        filePath: i.filePath,
        message: i.message
      }))
    }
  };
}

export async function buildArtifactsAndQuality(workflow: WorkflowRun): Promise<ArtifactBuildResult> {
  // Generate project structure
  const projectFiles = generateProjectStructure(workflow);
  projectFiles['README.md'] = createREADME(workflow);
  projectFiles['.github/workflows/agents.yml'] = AGENTS_WORKFLOW_YML;

  // Project-level validation
  const structure = validateProjectStructure(projectFiles);
  const structureIssues = structure.valid ? [] : mapStructureErrors(structure.errors);

  // Format + validate syntax
  const linted = await lintAndFormatProject(projectFiles);

  // Basic tester/coverage heuristics
  const testValidation = validateTestsAndSyntax(linted.files);

  const allIssues: ValidationIssue[] = [
    ...structureIssues,
    ...linted.issues,
    ...testValidation.issues
  ];

  const { score, errors, warnings } = scoreFromIssues(allIssues);

  return {
    files: linted.files,
    quality: {
      score,
      errors,
      warnings,
      formattedFiles: linted.formattedFiles,
      coverageEstimate: testValidation.coverageEstimate,
      issues: allIssues.map(i => ({
        tool: i.tool,
        severity: i.severity,
        filePath: i.filePath,
        message: i.message
      }))
    }
  };
}

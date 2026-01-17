import { GeminiClient } from './utils/gemini';
import { WORKFLOW_SEQUENCE, getRoleById } from './agents/roles';
import { WorkflowRun, AgentStep } from './utils/types';
import { ArtifactManager } from './artifacts/manager';
import { buildArtifactsAndQuality, validateArtifacts } from './artifacts/pipeline';
import { buildFixRequests } from './utils/feedback';
import { applyFileUpdates, parseFileUpdatesFromAgentOutput } from './validation/feedback-loop';
import type { ValidationIssue } from './validation/linter';
import type { AuditStore, AuditEventType } from './audit';

export interface WorkflowContext {
  featureRequest: string;
  outputs: Record<string, string>;
}

export interface WorkflowMetrics {
  totalDuration: number;
  stepDurations: Record<string, number>;
  outputSizes: Record<string, number>;
  truncatedSteps: string[];
}

const MAX_OUTPUT_SIZE = 32 * 1024; // 32KB per step output
// Note: MAX_CONTEXT_SIZE reserved for future context window management
// const MAX_CONTEXT_SIZE = 128 * 1024; // 128KB total context

export class WorkflowOrchestrator {
  private gemini: GeminiClient;
  private metrics: WorkflowMetrics;
  private artifactManager?: ArtifactManager;
  private enableFeedbackLoop: boolean;
  private auditStore?: AuditStore;

  constructor(
    geminiApiKey: string,
    artifactManager?: ArtifactManager,
    options?: { enableFeedbackLoop?: boolean; auditStore?: AuditStore }
  ) {
    this.gemini = new GeminiClient({ apiKey: geminiApiKey });
    this.artifactManager = artifactManager;
    this.enableFeedbackLoop = Boolean(options?.enableFeedbackLoop);
    this.auditStore = options?.auditStore;
    this.metrics = {
      totalDuration: 0,
      stepDurations: {},
      outputSizes: {},
      truncatedSteps: []
    };
  }

  private async audit(
    auditId: string,
    event: { type: AuditEventType; data?: unknown }
  ): Promise<void> {
    try {
      await this.auditStore?.append(auditId, { type: event.type, data: event.data });
    } catch {
      // best-effort
    }
  }

  private truncateOutput(output: string, roleId: string): string {
    if (output.length <= MAX_OUTPUT_SIZE) {
      return output;
    }
    this.metrics.truncatedSteps.push(roleId);
    const truncated = output.substring(0, MAX_OUTPUT_SIZE - 100);
    return `${truncated}\n\n... [Output truncated. Original size: ${output.length} chars, showing first ${MAX_OUTPUT_SIZE} chars]`;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    };
    console.log(JSON.stringify(logEntry));
  }

  async runWorkflow(featureRequest: string, options?: { workflowId?: string }): Promise<WorkflowRun> {
    const workflowId = options?.workflowId ?? crypto.randomUUID();
    const workflowStartTime = Date.now();
    const now = new Date().toISOString();
    
    this.log('info', 'Workflow started', { workflowId, featureRequestLength: featureRequest.length });

    await this.audit(workflowId, {
      type: 'workflow.started',
      data: { workflowId, featureRequestLength: featureRequest.length }
    });
    
    const workflow: WorkflowRun = {
      id: workflowId,
      featureRequest,
      status: 'in_progress',
      steps: [],
      createdAt: now,
      updatedAt: now
    };

    const context: WorkflowContext = {
      featureRequest,
      outputs: {}
    };

    // Execute agents in sequence
    for (const roleId of WORKFLOW_SEQUENCE) {
      const role = getRoleById(roleId);
      if (!role) continue;

      const stepStartTime = Date.now();
      const step: AgentStep = {
        roleId,
        status: 'in_progress',
        input: featureRequest,
        startedAt: new Date().toISOString()
      };

      workflow.steps.push(step);
      this.log('info', 'Step started', { workflowId, roleId, stepIndex: workflow.steps.length - 1 });

      await this.audit(workflowId, {
        type: 'step.started',
        data: { workflowId, roleId, stepIndex: workflow.steps.length - 1 }
      });

      try {
        // Build context-aware prompt
        const contextStr = Object.entries(context.outputs)
          .map(([key, value]) => `\n### ${key} Output:\n${value}`)
          .join('\n');

        const fullInput = contextStr
          ? `${featureRequest}\n\nPrevious Agent Outputs:${contextStr}`
          : featureRequest;

        const output = await this.gemini.generate(fullInput, role.systemPrompt);
        const stepDuration = Date.now() - stepStartTime;

        // Truncate output if too large
        const truncatedOutput = this.truncateOutput(output, roleId);
        step.output = truncatedOutput;
        step.status = 'completed';
        step.finishedAt = new Date().toISOString();

        // Track metrics
        this.metrics.stepDurations[roleId] = stepDuration;
        this.metrics.outputSizes[roleId] = output.length;

        this.log('info', 'Step completed', {
          workflowId,
          roleId,
          duration: stepDuration,
          outputSize: output.length,
          truncated: output.length > MAX_OUTPUT_SIZE
        });

        await this.audit(workflowId, {
          type: 'step.completed',
          data: {
            workflowId,
            roleId,
            stepIndex: workflow.steps.length - 1,
            durationMs: stepDuration,
            outputSize: output.length,
            truncated: output.length > MAX_OUTPUT_SIZE
          }
        });

        context.outputs[roleId] = truncatedOutput;
      } catch (error) {
        const stepDuration = Date.now() - stepStartTime;
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        step.finishedAt = new Date().toISOString();

        this.metrics.stepDurations[roleId] = stepDuration;

        this.log('error', 'Step failed', {
          workflowId,
          roleId,
          duration: stepDuration,
          error: step.error
        });

        await this.audit(workflowId, {
          type: 'step.failed',
          data: {
            workflowId,
            roleId,
            stepIndex: workflow.steps.length - 1,
            durationMs: stepDuration,
            error: step.error
          }
        });

        workflow.status = 'failed';
        workflow.updatedAt = new Date().toISOString();
        this.metrics.totalDuration = Date.now() - workflowStartTime;

        await this.audit(workflowId, {
          type: 'workflow.failed',
          data: { workflowId, totalDurationMs: this.metrics.totalDuration }
        });

        return workflow;
      }
    }

    this.metrics.totalDuration = Date.now() - workflowStartTime;
    workflow.status = 'completed';
    workflow.updatedAt = new Date().toISOString();

    // E2: Code quality & validation (runs even without GitHub publishing)
    let builtArtifacts: { files: Record<string, string>; quality: WorkflowRun['quality'] } | undefined;
    try {
      if (workflow.steps.some(s => s.status === 'completed' && s.output)) {
        const built = await buildArtifactsAndQuality(workflow);
        workflow.quality = built.quality;
        workflow.qualityGatePassed = built.quality.errors === 0;
        builtArtifacts = { files: built.files, quality: built.quality };

        await this.audit(workflowId, {
          type: 'quality.completed',
          data: {
            workflowId,
            score: built.quality.score,
            errors: built.quality.errors,
            warnings: built.quality.warnings,
            qualityGatePassed: built.quality.errors === 0
          }
        });

        // E2: Optional feedback loop (disabled by default)
        if (this.enableFeedbackLoop && built.quality.errors > 0) {
          for (let round = 1; round <= 3; round++) {
            const currentIssues = workflow.quality?.issues ?? [];
            const errorIssues = currentIssues.filter(i => i.severity === 'error');
            if (errorIssues.length === 0) break;

            const fixRequests = buildFixRequests(errorIssues.map(i => ({
              tool: i.tool,
              severity: i.severity,
              filePath: i.filePath,
              message: i.message
            })) as ValidationIssue[]);
            if (fixRequests.length === 0) break;

            // Process up to 2 roles per round to reduce Gemini usage.
            const selected = fixRequests
              .sort((a, b) => b.issues.length - a.issues.length)
              .slice(0, 2);

            this.log('info', 'Feedback loop round started', {
              workflowId: workflow.id,
              round,
              requests: selected.map(r => r.roleId)
            });

            for (const req of selected) {
              const role = getRoleById(req.roleId);
              if (!role) continue;

              const fileContext = req.filePaths
                .slice(0, 5)
                .map(p => {
                  const content = builtArtifacts?.files?.[p] ?? '';
                  const snippet = content.length > 4000 ? content.slice(0, 4000) + '\n... [truncated]' : content;
                  return `\n\n---\nFILE: ${p}\n\n${snippet}`;
                })
                .join('');

              const message = `${req.prompt}\n\nCurrent file contents:${fileContext}`;
              const agentOut = await this.gemini.generate(message, role.systemPrompt);
              const updates = parseFileUpdatesFromAgentOutput(agentOut);
              if (updates.length === 0) continue;

              const applied = applyFileUpdates(builtArtifacts.files, updates);
              builtArtifacts.files = applied.files;
            }

            const revalidated = await validateArtifacts(builtArtifacts.files);
            workflow.quality = revalidated.quality;
            workflow.qualityGatePassed = revalidated.quality.errors === 0;
            builtArtifacts = { files: revalidated.files, quality: revalidated.quality };

            if (revalidated.quality.errors === 0) break;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('warn', 'Validation step failed', { workflowId: workflow.id, error: message });
      // Non-blocking: quality report is optional
    }

    // Generate and publish artifacts to GitHub if manager available
    if (this.artifactManager && this.artifactManager.hasArtifacts(workflow)) {
      try {
        this.log('info', 'Generating artifacts...', { workflowId: workflow.id });

        await this.audit(workflowId, {
          type: 'artifacts.publish.started',
          data: { workflowId }
        });

        const pr = await this.artifactManager.generateAndPublish(workflow, builtArtifacts);
        workflow.artifactUrl = pr.url;
        workflow.prNumber = pr.number;
        workflow.branch = pr.branch;
        this.log('info', 'Artifacts published to GitHub', {
          workflowId: workflow.id,
          prUrl: pr.url,
          prNumber: pr.number
        });

        await this.audit(workflowId, {
          type: 'artifacts.publish.completed',
          data: { workflowId, prNumber: pr.number, prUrl: pr.url, branch: pr.branch }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log('warn', 'Failed to publish artifacts', {
          workflowId: workflow.id,
          error: message
        });

        await this.audit(workflowId, {
          type: 'artifacts.publish.failed',
          data: { workflowId, error: message }
        });

        // Don't fail the workflow if artifact generation fails
      }
    }

    this.log('info', 'Workflow completed', {
      workflowId,
      totalDuration: this.metrics.totalDuration,
      stepCount: workflow.steps.length,
      truncatedSteps: this.metrics.truncatedSteps.length
    });

    await this.audit(workflowId, {
      type: 'workflow.completed',
      data: {
        workflowId,
        totalDurationMs: this.metrics.totalDuration,
        stepCount: workflow.steps.length,
        truncatedSteps: this.metrics.truncatedSteps
      }
    });

    return workflow;
  }

  async runAgentChat(roleId: string, message: string, context?: Record<string, unknown>): Promise<string> {
    const role = getRoleById(roleId);
    if (!role) {
      throw new Error(`Invalid role: ${roleId}`);
    }

    return this.gemini.generateWithContext(message, role.systemPrompt, context || {});
  }
}

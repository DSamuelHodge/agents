import { GeminiClient } from './utils/gemini';
import { WORKFLOW_SEQUENCE, getRoleById } from './agents/roles';
import { WorkflowRun, AgentStep } from './utils/types';

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

  constructor(geminiApiKey: string) {
    this.gemini = new GeminiClient({ apiKey: geminiApiKey });
    this.metrics = {
      totalDuration: 0,
      stepDurations: {},
      outputSizes: {},
      truncatedSteps: []
    };
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

  async runWorkflow(featureRequest: string): Promise<WorkflowRun> {
    const workflowId = crypto.randomUUID();
    const workflowStartTime = Date.now();
    const now = new Date().toISOString();
    
    this.log('info', 'Workflow started', { workflowId, featureRequestLength: featureRequest.length });
    
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

        workflow.status = 'failed';
        workflow.updatedAt = new Date().toISOString();
        this.metrics.totalDuration = Date.now() - workflowStartTime;
        return workflow;
      }
    }

    this.metrics.totalDuration = Date.now() - workflowStartTime;
    workflow.status = 'completed';
    workflow.updatedAt = new Date().toISOString();

    this.log('info', 'Workflow completed', {
      workflowId,
      totalDuration: this.metrics.totalDuration,
      stepCount: workflow.steps.length,
      truncatedSteps: this.metrics.truncatedSteps.length
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

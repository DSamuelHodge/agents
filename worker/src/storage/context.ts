import type { WorkflowRun, AgentStep } from '../utils/types';
import type { DurableObjectState } from '@cloudflare/workers-types';

/**
 * Storage adapter for workflow context and state.
 * Uses Durable Objects as authoritative store (per-workflow isolation).
 * 
 * Data model:
 * - Key: `workflow:${id}` → WorkflowRun object
 * - Key: `step:${workflowId}:${stepIndex}` → AgentStep object
 * 
 * Supports:
 * - Create/read/update workflow runs
 * - Append and update steps within a workflow
 * - List steps for a workflow
 */

export interface StorageAdapter {
  createWorkflow(run: WorkflowRun): Promise<WorkflowRun>;
  getWorkflow(id: string): Promise<WorkflowRun | null>;
  updateWorkflow(id: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun>;
  addStep(workflowId: string, step: AgentStep): Promise<AgentStep>;
  updateStep(workflowId: string, stepIndex: number, updates: Partial<AgentStep>): Promise<AgentStep>;
  getSteps(workflowId: string): Promise<AgentStep[]>;
}

/**
 * DurableObjectStorageAdapter: Uses Durable Object state for persistence
 * Each workflow gets its own DO instance for isolation and performance.
 */
export class DurableObjectStorageAdapter implements StorageAdapter {
  constructor(
    private state: DurableObjectState,
    private env: Record<string, unknown>
  ) {}

  async createWorkflow(run: WorkflowRun): Promise<WorkflowRun> {
    const key = `workflow:${run.id}`;
    await this.state.storage.put(key, JSON.stringify(run));
    return run;
  }

  async getWorkflow(id: string): Promise<WorkflowRun | null> {
    const key = `workflow:${id}`;
    const data = await this.state.storage.get(key);
    return data ? JSON.parse(data as string) : null;
  }

  async updateWorkflow(id: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun> {
    const key = `workflow:${id}`;
    const existing = await this.getWorkflow(id);
    if (!existing) {
      throw new Error(`Workflow ${id} not found`);
    }
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.state.storage.put(key, JSON.stringify(updated));
    return updated;
  }

  async addStep(workflowId: string, step: AgentStep): Promise<AgentStep> {
    // Get current steps to determine index
    const steps = await this.getSteps(workflowId);
    const stepIndex = steps.length;
    const key = `step:${workflowId}:${stepIndex}`;
    await this.state.storage.put(key, JSON.stringify(step));
    
    // Update workflow to reflect new step
    const workflow = await this.getWorkflow(workflowId);
    if (workflow) {
      workflow.steps.push(step);
      await this.updateWorkflow(workflowId, { steps: workflow.steps });
    }
    
    return step;
  }

  async updateStep(workflowId: string, stepIndex: number, updates: Partial<AgentStep>): Promise<AgentStep> {
    const key = `step:${workflowId}:${stepIndex}`;
    const data = await this.state.storage.get(key);
    if (!data) {
      throw new Error(`Step ${stepIndex} not found in workflow ${workflowId}`);
    }
    const existing = JSON.parse(data as string) as AgentStep;
    const updated = { ...existing, ...updates };
    await this.state.storage.put(key, JSON.stringify(updated));
    
    // Update workflow steps array
    const workflow = await this.getWorkflow(workflowId);
    if (workflow) {
      workflow.steps[stepIndex] = updated;
      await this.updateWorkflow(workflowId, { steps: workflow.steps });
    }
    
    return updated;
  }

  async getSteps(workflowId: string): Promise<AgentStep[]> {
    const workflow = await this.getWorkflow(workflowId);
    return workflow?.steps || [];
  }
}

/**
 * MemoryStorageAdapter: Simple in-memory store for testing
 * Useful for local development and unit tests.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private workflows = new Map<string, WorkflowRun>();
  private steps = new Map<string, Map<number, AgentStep>>();

  async createWorkflow(run: WorkflowRun): Promise<WorkflowRun> {
    this.workflows.set(run.id, run);
    this.steps.set(run.id, new Map());
    return run;
  }

  async getWorkflow(id: string): Promise<WorkflowRun | null> {
    return this.workflows.get(id) || null;
  }

  async updateWorkflow(id: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun> {
    const existing = this.workflows.get(id);
    if (!existing) {
      throw new Error(`Workflow ${id} not found`);
    }
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.workflows.set(id, updated);
    return updated;
  }

  async addStep(workflowId: string, step: AgentStep): Promise<AgentStep> {
    if (!this.workflows.has(workflowId)) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    const stepMap = this.steps.get(workflowId)!;
    const stepIndex = stepMap.size;
    stepMap.set(stepIndex, step);
    
    const workflow = this.workflows.get(workflowId)!;
    workflow.steps.push(step);
    
    return step;
  }

  async updateStep(workflowId: string, stepIndex: number, updates: Partial<AgentStep>): Promise<AgentStep> {
    const stepMap = this.steps.get(workflowId);
    if (!stepMap || !stepMap.has(stepIndex)) {
      throw new Error(`Step ${stepIndex} not found in workflow ${workflowId}`);
    }
    const existing = stepMap.get(stepIndex)!;
    const updated = { ...existing, ...updates };
    stepMap.set(stepIndex, updated);
    
    const workflow = this.workflows.get(workflowId)!;
    workflow.steps[stepIndex] = updated;
    
    return updated;
  }

  async getSteps(workflowId: string): Promise<AgentStep[]> {
    const stepMap = this.steps.get(workflowId);
    if (!stepMap) return [];
    return Array.from(stepMap.values());
  }
}

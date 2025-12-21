import { Agent, callable } from 'agents';
import type { Connection, ConnectionContext, WSMessage } from 'agents';
import { WorkflowOrchestrator } from '../workflow';
import { ArtifactManager } from '../artifacts/manager';
import type { WorkflowRun } from '../utils/types';

// Environment interface
export interface WorkflowEnv {
  GEMINI_API_KEY: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  ENVIRONMENT?: string;
  [key: string]: unknown;
}

// State interface for the workflow agent
export interface WorkflowState {
  // Current workflow execution
  currentWorkflow?: WorkflowRun;
  
  // Workflow history (lightweight index)
  workflowHistory: Array<{
    id: string;
    featureRequest: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    artifactUrl?: string;
    prNumber?: number;
    branch?: string;
    qualityGatePassed?: boolean;
    qualityScore?: number;
  }>;
  
  // App settings
  settings: {
    github: { owner: string; repo: string };
    autoMerge: boolean;
    requiredApprovals: number;
    requiredReviewers: string[];
    deploymentEnvironment: string;
    updatedAt?: string;
  };
  
  // Connection tracking
  activeConnections: number;
  
  // Last updated timestamp
  lastUpdated: string;
}

/**
 * WorkflowAgent - Cloudflare Agent SDK implementation
 * 
 * This agent manages the Digital Twin workflow execution:
 * - Orchestrates multi-agent workflows
 * - Manages workflow state and history
 * - Handles GitHub integration
 * - Provides real-time WebSocket updates
 * - Persists audit logs to SQL
 */
export class WorkflowAgent extends Agent<WorkflowEnv, WorkflowState> {
  // Store environment for access in methods
  private agentEnv?: WorkflowEnv;
  private getEnv(): WorkflowEnv {
    const fromBase = (this as unknown as { env?: WorkflowEnv }).env;
    return (fromBase ?? this.agentEnv ?? ({} as WorkflowEnv));
  }

  // Initial state for new agent instances
  initialState: WorkflowState = {
    workflowHistory: [],
    settings: {
      github: { owner: 'DSamuelHodge', repo: 'generated-projects' },
      autoMerge: false,
      requiredApprovals: 1,
      requiredReviewers: [],
      deploymentEnvironment: 'production'
    },
    activeConnections: 0,
    lastUpdated: new Date().toISOString()
  };

  /**
   * Called when agent starts or wakes from hibernation
   */
  async onStart(): Promise<void> {
    console.log('WorkflowAgent started');
    
    // Initialize SQL database for audit logs
    await this.initializeDatabase();
    
    // Load settings from environment if first start
    if (!this.state.settings.updatedAt) {
      const settings = this.buildSettingsFromEnv();
      this.setState({
        ...this.state,
        settings,
        lastUpdated: new Date().toISOString()
      });
    }
  }

  /**
   * Initialize SQL database schema for audit logging
   */
  private async initializeDatabase(): Promise<void> {
    // Create audit events table
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.sql`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data JSON,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;
    
    // Create index for efficient audit lookups
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.sql`
      CREATE INDEX IF NOT EXISTS idx_audit_events_audit_id 
      ON audit_events(audit_id, timestamp)
    `;
    
    // Create workflows table for full workflow storage
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.sql`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        feature_request TEXT NOT NULL,
        status TEXT NOT NULL,
        data JSON NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
    
    console.log('Database initialized');
  }

  /**
   * Build settings from environment variables
   */
  private buildSettingsFromEnv(): WorkflowState['settings'] {
    const env = this.getEnv();
    const owner = String(env.GITHUB_OWNER ?? 'DSamuelHodge').trim() || 'DSamuelHodge';
    const repo = String(env.GITHUB_REPO ?? 'generated-projects').trim() || 'generated-projects';
    const environment = String(env.ENVIRONMENT ?? 'production').trim() || 'production';
    
    return {
      github: { owner, repo },
      autoMerge: false,
      requiredApprovals: 1,
      requiredReviewers: [],
      deploymentEnvironment: environment,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * WebSocket connection handler
   */
  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    console.log('Client connected', { 
      url: ctx.request.url,
      connections: this.state.activeConnections + 1 
    });
    
    // Update connection count
    this.setState({
      ...this.state,
      activeConnections: this.state.activeConnections + 1,
      lastUpdated: new Date().toISOString()
    });
    
    // Send current state to new connection
    connection.send(JSON.stringify({
      type: 'state',
      data: {
        currentWorkflow: this.state.currentWorkflow,
        settings: this.state.settings
      }
    }));
  }

  /**
   * WebSocket message handler
   */
  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message !== 'string') return;
    
    try {
      const data = JSON.parse(message);
      const { action, payload, id } = data;
      
      switch (action) {
        case 'start-workflow':
          await this.handleStartWorkflow(connection, payload, id);
          break;
          
        case 'get-workflow':
          await this.handleGetWorkflow(connection, payload, id);
          break;
          
        case 'update-settings':
          await this.handleUpdateSettings(connection, payload, id);
          break;

        case 'get-settings':
          await this.handleGetSettings(connection, id);
          break;

        case 'get-history':
          await this.handleGetHistory(connection, payload, id);
          break;

        case 'compare-workflows':
          await this.handleCompareWorkflows(connection, payload, id);
          break;

        case 'export-workflow':
          await this.handleExportWorkflow(connection, payload, id);
          break;
        case 'get-pr-status':
          await this.handleGetPRStatus(connection, payload, id);
          break;
        case 'get-pr-diff':
          await this.handleGetPRDiff(connection, payload, id);
          break;
        case 'list-pr-comments':
          await this.handleListPRComments(connection, payload, id);
          break;
        case 'create-pr-comment':
          await this.handleCreatePRComment(connection, payload, id);
          break;
        case 'approve-pr':
          await this.handleApprovePR(connection, payload, id);
          break;
        case 'merge-pr':
          await this.handleMergePR(connection, payload, id);
          break;
          
        default:
          connection.send(JSON.stringify({
            type: 'error',
            message: `Unknown action: ${action}`,
            id
          }));
      }
    } catch (error) {
      connection.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  /**
   * Handle start workflow request via WebSocket
   */
  private async handleStartWorkflow(connection: Connection, payload: { featureRequest: string }, id?: string): Promise<void> {
    const { featureRequest } = payload;
    
    if (!featureRequest?.trim()) {
      connection.send(JSON.stringify({
        type: 'error',
        message: 'featureRequest is required',
        id
      }));
      return;
    }
    
    // Start workflow and stream updates
    try {
      const workflow = await this.executeWorkflow(featureRequest, connection);
      
      connection.send(JSON.stringify({
        type: 'workflow-complete',
        data: workflow,
        id
      }));
    } catch (error) {
      connection.send(JSON.stringify({
        type: 'workflow-error',
        message: error instanceof Error ? error.message : 'Workflow failed',
        id
      }));
    }
  }

  /**
   * Handle get workflow request
   */
  private async handleGetWorkflow(connection: Connection, payload: { id: string }, reqId?: string): Promise<void> {
    const { id } = payload;
    
    const workflows = this.sql<{ data: string }>`
      SELECT data FROM workflows WHERE id = ${id}
    `;
    
    if (workflows.length === 0) {
      connection.send(JSON.stringify({
        type: 'error',
        message: 'Workflow not found',
        id: reqId
      }));
      return;
    }
    
    connection.send(JSON.stringify({
      type: 'workflow',
      data: JSON.parse(workflows[0].data),
      id: reqId
    }));
  }

  /**
   * Handle settings update
   */
  private async handleUpdateSettings(connection: Connection, payload: Partial<WorkflowState['settings']>, reqId?: string): Promise<void> {
    const newSettings = {
      ...this.state.settings,
      ...payload,
      updatedAt: new Date().toISOString()
    };
    
    this.setState({
      ...this.state,
      settings: newSettings,
      lastUpdated: new Date().toISOString()
    });
    
    // Broadcast to all connections
    this.broadcast(JSON.stringify({
      type: 'settings-updated',
      data: newSettings
    }));

    // Respond to caller
    connection.send(JSON.stringify({
      type: 'settings',
      data: newSettings,
      id: reqId
    }));
  }

  private async handleGetSettings(connection: Connection, reqId?: string): Promise<void> {
    connection.send(JSON.stringify({
      type: 'settings',
      data: this.state.settings,
      id: reqId
    }));
  }

  private async handleGetHistory(connection: Connection, payload: { limit?: number }, reqId?: string): Promise<void> {
    const limit = Math.min(Math.max(Number(payload?.limit ?? 50), 1), 200);
    const history = this.state.workflowHistory.slice(0, limit);
    connection.send(JSON.stringify({
      type: 'history',
      data: { items: history },
      id: reqId
    }));
  }

  private async handleCompareWorkflows(connection: Connection, payload: { a: string; b: string }, reqId?: string): Promise<void> {
    const { a, b } = payload;
    const result = await this.compareWorkflows(a, b);
    connection.send(JSON.stringify({
      type: 'compare',
      data: result,
      id: reqId
    }));
  }

  private async handleExportWorkflow(connection: Connection, payload: { id: string }, reqId?: string): Promise<void> {
    const { id } = payload;
    const result = await this.exportWorkflow(id);
    connection.send(JSON.stringify({
      type: 'export',
      data: result,
      id: reqId
    }));
  }

  private async handleGetPRStatus(connection: Connection, payload: { prNumber: number }, reqId?: string): Promise<void> {
    try {
      const res = await this.getPullRequestStatus(Number(payload?.prNumber));
      connection.send(JSON.stringify({ type: 'pr-status', data: res, id: reqId }));
    } catch (error) {
      connection.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Failed to get PR status', id: reqId }));
    }
  }

  private async handleGetPRDiff(connection: Connection, payload: { prNumber: number }, reqId?: string): Promise<void> {
    try {
      const res = await this.getPullRequestDiff(Number(payload?.prNumber));
      connection.send(JSON.stringify({ type: 'pr-diff', data: res, id: reqId }));
    } catch (error) {
      connection.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Failed to get PR diff', id: reqId }));
    }
  }

  private async handleListPRComments(connection: Connection, payload: { prNumber: number }, reqId?: string): Promise<void> {
    try {
      const res = await this.listPullRequestReviewComments(Number(payload?.prNumber));
      connection.send(JSON.stringify({ type: 'pr-comments', data: res, id: reqId }));
    } catch (error) {
      connection.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Failed to list PR comments', id: reqId }));
    }
  }

  private async handleCreatePRComment(connection: Connection, payload: { prNumber: number; path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }, reqId?: string): Promise<void> {
    try {
      const res = await this.createPullRequestReviewComment(payload);
      connection.send(JSON.stringify({ type: 'pr-comment-created', data: res, id: reqId }));
    } catch (error) {
      connection.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Failed to create PR comment', id: reqId }));
    }
  }

  private async handleApprovePR(connection: Connection, payload: { prNumber: number; notes?: string }, reqId?: string): Promise<void> {
    try {
      const res = await this.approvePullRequest(Number(payload?.prNumber), payload?.notes);
      connection.send(JSON.stringify({ type: 'pr-approved', data: res, id: reqId }));
    } catch (error) {
      connection.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Failed to approve PR', id: reqId }));
    }
  }

  private async handleMergePR(connection: Connection, payload: { prNumber: number; method?: 'merge' | 'squash' | 'rebase'; notes?: string }, reqId?: string): Promise<void> {
    try {
      const res = await this.mergePullRequest({ prNumber: Number(payload?.prNumber), method: payload?.method, notes: payload?.notes });
      connection.send(JSON.stringify({ type: 'pr-merged', data: res, id: reqId }));
    } catch (error) {
      connection.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Failed to merge PR', id: reqId }));
    }
  }

  /**
   * WebSocket disconnection handler
   */
  async onClose(_connection: Connection, code: number, reason: string): Promise<void> {
    console.log('Client disconnected', { code, reason });
    
    this.setState({
      ...this.state,
      activeConnections: Math.max(0, this.state.activeConnections - 1),
      lastUpdated: new Date().toISOString()
    });
  }

  /**
   * WebSocket error handler
   */
  async onError(error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
  }

  /**
   * State update handler - called when state changes
   */
  onStateUpdate(state: WorkflowState, source: 'server' | Connection): void {
    console.log('State updated by:', source === 'server' ? 'server' : 'client');
    
    // Notify all connected clients about state change
    if (source === 'server') {
      this.broadcast(JSON.stringify({
        type: 'state-update',
        data: {
          currentWorkflow: state.currentWorkflow,
          settings: state.settings,
          lastUpdated: state.lastUpdated
        }
      }));
    }
  }

  /**
   * Execute workflow orchestration
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async executeWorkflow(featureRequest: string, _connection?: Connection): Promise<WorkflowRun> {
    const workflowId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const env = this.getEnv();
    
    // Initialize workflow
    const workflow: WorkflowRun = {
      id: workflowId,
      featureRequest,
      status: 'in_progress',
      steps: [],
      createdAt: now,
      updatedAt: now
    };
    
    // Update state with current workflow
    this.setState({
      ...this.state,
      currentWorkflow: workflow,
      lastUpdated: now
    });
    
    // Log audit event
    await this.auditLog(workflowId, 'workflow.started', {
      featureRequestLength: featureRequest.length
    });
    
    const artifactManager = env.GITHUB_TOKEN ? new ArtifactManager({
      githubToken: env.GITHUB_TOKEN,
      githubOwner: this.state.settings.github.owner,
      githubRepo: this.state.settings.github.repo
    }) : undefined;
    
    const orchestrator = new WorkflowOrchestrator(
      env.GEMINI_API_KEY,
      artifactManager,
      {
        enableFeedbackLoop: true,
        auditStore: {
          append: async (auditId: string, event) => {
            await this.auditLog(auditId, event.type as string, event.data);
            return { id: crypto.randomUUID(), ...event, ts: event.ts || new Date().toISOString() };
          },
          list: async (auditId: string) => {
            const events = this.getAuditEvents(auditId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return events.map(e => ({ id: crypto.randomUUID(), ...e, type: e.type as any, ts: e.ts || new Date().toISOString() }));
          }
        }
      }
    );
    
    // Execute workflow
    const result = await orchestrator.runWorkflow(featureRequest, { workflowId });
    
    // Update final state
    this.setState({
      ...this.state,
      currentWorkflow: result,
      lastUpdated: new Date().toISOString()
    });
    
    // Persist to SQL
    await this.persistWorkflow(result);
    
    // Update history index
    await this.updateHistoryIndex(result);
    
    // Log completion
    await this.auditLog(workflowId, 
      result.status === 'completed' ? 'workflow.completed' : 'workflow.failed',
      { status: result.status }
    );
    
    return result;
  }

  /**
   * Persist workflow to SQL database
   */
  private async persistWorkflow(workflow: WorkflowRun): Promise<void> {
    const createdAt = new Date(workflow.createdAt).getTime();
    const updatedAt = new Date(workflow.updatedAt).getTime();
    
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.sql`
      INSERT OR REPLACE INTO workflows (id, feature_request, status, data, created_at, updated_at)
      VALUES (
        ${workflow.id},
        ${workflow.featureRequest},
        ${workflow.status},
        ${JSON.stringify(workflow)},
        ${createdAt},
        ${updatedAt}
      )
    `;
  }

  /**
   * Update workflow history index
   */
  private async updateHistoryIndex(workflow: WorkflowRun): Promise<void> {
    const item = {
      id: workflow.id,
      featureRequest: workflow.featureRequest,
      status: workflow.status,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      artifactUrl: workflow.artifactUrl,
      prNumber: workflow.prNumber,
      branch: workflow.branch,
      qualityGatePassed: workflow.qualityGatePassed,
      qualityScore: workflow.quality?.score
    };
    
    const filtered = this.state.workflowHistory.filter(x => x.id !== workflow.id);
    const newHistory = [item, ...filtered]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 200);
    
    this.setState({
      ...this.state,
      workflowHistory: newHistory,
      lastUpdated: new Date().toISOString()
    });
  }

  /**
   * Log audit event to SQL database
   */
  private async auditLog(auditId: string, type: string, data?: unknown): Promise<void> {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.sql`
      INSERT INTO audit_events (id, audit_id, type, timestamp, data)
      VALUES (
        ${id},
        ${auditId},
        ${type},
        ${timestamp},
        ${JSON.stringify(data ?? null)}
      )
    `;
  }

  /**
   * Get audit events for a workflow
   */
  private getAuditEvents(auditId: string): Array<{ type: string; ts?: string; data?: unknown }> {
    const rows = this.sql<{ type: string; timestamp: number; data: string | null }>`
      SELECT type, timestamp, data
      FROM audit_events
      WHERE audit_id = ${auditId}
      ORDER BY timestamp ASC
    `;
    
    return rows.map(row => ({
      type: row.type,
      ts: new Date(row.timestamp).toISOString(),
      data: row.data ? JSON.parse(row.data) : undefined
    }));
  }

  // ============================================
  // Callable Methods (RPC from client)
  // ============================================

  /**
   * Start a new workflow (callable from client)
   */
  @callable()
  async startWorkflow(featureRequest: string): Promise<WorkflowRun> {
    if (!featureRequest?.trim()) {
      throw new Error('featureRequest is required');
    }
    
    return await this.executeWorkflow(featureRequest);
  }

  /**
   * Get workflow by ID
   */
  @callable()
  async getWorkflow(workflowId: string): Promise<WorkflowRun | null> {
    const workflows = this.sql<{ data: string }>`
      SELECT data FROM workflows WHERE id = ${workflowId}
    `;
    
    if (workflows.length === 0) return null;
    return JSON.parse(workflows[0].data);
  }

  /**
   * Get workflow history with optional limit
   */
  @callable()
  async getHistory(limit: number = 50): Promise<WorkflowState['workflowHistory']> {
    const capped = Math.min(Math.max(limit, 1), 200);
    return this.state.workflowHistory.slice(0, capped);
  }

  /**
   * Get audit events for a workflow
   */
  @callable()
  async getAudit(auditId: string): Promise<Array<{ type: string; ts?: string; data?: unknown }>> {
    return this.getAuditEvents(auditId);
  }

  /**
   * Update application settings
   */
  @callable()
  async updateSettings(settings: Partial<WorkflowState['settings']>): Promise<WorkflowState['settings']> {
    const newSettings = {
      ...this.state.settings,
      ...settings,
      updatedAt: new Date().toISOString()
    };
    
    this.setState({
      ...this.state,
      settings: newSettings,
      lastUpdated: new Date().toISOString()
    });
    
    return newSettings;
  }

  /**
   * Get current settings
   */
  @callable()
  async getSettings(): Promise<WorkflowState['settings']> {
    return this.state.settings;
  }

  /**
   * Compare two workflows
   */
  @callable()
  async compareWorkflows(workflowIdA: string, workflowIdB: string): Promise<{
    a: string;
    b: string;
    diff: Array<{ roleId: string; a: string; b: string; same: boolean }>;
  }> {
    const workflowA = await this.getWorkflow(workflowIdA);
    const workflowB = await this.getWorkflow(workflowIdB);
    
    if (!workflowA || !workflowB) {
      throw new Error('One or both workflows not found');
    }
    
    const mapA = new Map<string, string>();
    const mapB = new Map<string, string>();
    
    for (const step of workflowA.steps) {
      if (step.roleId && step.output) {
        mapA.set(step.roleId, step.output);
      }
    }
    
    for (const step of workflowB.steps) {
      if (step.roleId && step.output) {
        mapB.set(step.roleId, step.output);
      }
    }
    
    const roles = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
    
    const diff = roles.map(roleId => ({
      roleId,
      a: mapA.get(roleId) ?? '',
      b: mapB.get(roleId) ?? '',
      same: (mapA.get(roleId) ?? '').trim() === (mapB.get(roleId) ?? '').trim()
    }));
    
    return { a: workflowIdA, b: workflowIdB, diff };
  }

  /**
   * Export workflow with audit trail
   */
  @callable()
  async exportWorkflow(workflowId: string): Promise<{
    exportedAt: string;
    workflow: WorkflowRun | null;
    audit: Array<{ type: string; ts?: string; data?: unknown }>;
  }> {
    const workflow = await this.getWorkflow(workflowId);
    const audit = this.getAuditEvents(workflowId);
    
    return {
      exportedAt: new Date().toISOString(),
      workflow,
      audit
    };
  }

  // GitHub PR Operations - callable methods
  @callable()
  async getPullRequestStatus(prNumber: number): Promise<{
    prNumber: number;
    state: 'open' | 'closed' | 'merged';
    merged: boolean;
    approvals: number;
    requiredApprovals: number;
    requiredReviewers?: string[];
    approvedBy?: string[];
    missingReviewers?: string[];
    label: 'open' | 'closed' | 'merged' | 'approved';
  }> {
    const env = this.getEnv();
    const token = env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const { GitHubClient } = await import('../utils/github');
    const client = new GitHubClient({
      token,
      owner: this.state.settings.github.owner,
      repo: this.state.settings.github.repo
    });

    const status = await client.getPRStatus(prNumber);
    const approvalsDetail = await client.getPRApprovalDetails(prNumber);
    const approvedBy = approvalsDetail.map(a => a.user);

    const requiredApprovals = Number(this.state.settings.requiredApprovals ?? 1);
    const requiredReviewers = this.state.settings.requiredReviewers ?? [];
    const missingReviewers = requiredReviewers.filter(r => !approvedBy.includes(r));

    const label: 'open' | 'closed' | 'merged' | 'approved' = status.merged
      ? 'merged'
      : (status.state === 'closed' ? 'closed'
        : (status.approvals >= requiredApprovals && missingReviewers.length === 0 ? 'approved' : 'open'));

    return {
      prNumber,
      state: status.merged ? 'merged' : status.state,
      merged: status.merged,
      approvals: status.approvals,
      requiredApprovals,
      requiredReviewers,
      approvedBy,
      missingReviewers,
      label
    };
  }

  @callable()
  async getPullRequestDiff(prNumber: number): Promise<{ prNumber: number; files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string | null }> }> {
    const env = this.getEnv();
    const token = env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const { GitHubClient } = await import('../utils/github');
    const client = new GitHubClient({
      token,
      owner: this.state.settings.github.owner,
      repo: this.state.settings.github.repo
    });
    const files = await client.listPullRequestFiles(prNumber);
    return { prNumber, files };
  }

  @callable()
  async listPullRequestReviewComments(prNumber: number): Promise<{ prNumber: number; comments: Array<{ id: number; url: string; user: string; body: string; path: string; line?: number | null; side?: 'LEFT' | 'RIGHT' | null; createdAt?: string; updatedAt?: string }> }> {
    const env = this.getEnv();
    const token = env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const { GitHubClient } = await import('../utils/github');
    const client = new GitHubClient({
      token,
      owner: this.state.settings.github.owner,
      repo: this.state.settings.github.repo
    });
    const comments = await client.listPullRequestReviewComments(prNumber);
    return { prNumber, comments };
  }

  @callable()
  async createPullRequestReviewComment(input: { prNumber: number; path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }): Promise<{ prNumber: number; id: number; url: string }> {
    const env = this.getEnv();
    const token = env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const { GitHubClient } = await import('../utils/github');
    const client = new GitHubClient({
      token,
      owner: this.state.settings.github.owner,
      repo: this.state.settings.github.repo
    });
    const created = await client.createPullRequestReviewComment(input.prNumber, {
      body: input.body,
      path: input.path,
      line: input.line,
      side: input.side ?? 'RIGHT'
    });
    return { prNumber: input.prNumber, id: created.id, url: created.url };
  }

  @callable()
  async approvePullRequest(prNumber: number, notes?: string): Promise<{ prNumber: number; approved: boolean }> {
    const env = this.getEnv();
    const token = env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const { GitHubClient } = await import('../utils/github');
    const client = new GitHubClient({
      token,
      owner: this.state.settings.github.owner,
      repo: this.state.settings.github.repo
    });
    await client.approvePullRequest(prNumber, notes);
    return { prNumber, approved: true };
  }

  @callable()
  async mergePullRequest(input: { prNumber: number; method?: 'merge' | 'squash' | 'rebase'; notes?: string }): Promise<{ prNumber: number; merged: boolean; message?: string; sha?: string; method: string }> {
    const env = this.getEnv();
    const token = env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const { GitHubClient } = await import('../utils/github');
    const client = new GitHubClient({
      token,
      owner: this.state.settings.github.owner,
      repo: this.state.settings.github.repo
    });
    const res = await client.mergePullRequest(input.prNumber, input.method ?? 'squash', undefined, input.notes);
    return { prNumber: input.prNumber, merged: res.merged, message: res.message, sha: res.sha, method: input.method ?? 'squash' };
  }

  // ============================================
  // HTTP Request Handler (for direct HTTP calls)
  // ============================================

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    // Status check
    if (path === '/status') {
      return new Response(JSON.stringify({
        ok: true,
        agent: 'WorkflowAgent',
        activeConnections: this.state.activeConnections,
        workflowCount: this.state.workflowHistory.length,
        lastUpdated: this.state.lastUpdated
      }), { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    }
    
    // Default: return current state
    return new Response(JSON.stringify({
      ok: true,
      state: {
        currentWorkflow: this.state.currentWorkflow,
        historyCount: this.state.workflowHistory.length,
        settings: this.state.settings,
        activeConnections: this.state.activeConnections
      }
    }), { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }
}

// Alias class for sqlite-enabled Durable Object binding
export class WorkflowAgentSql extends WorkflowAgent {}

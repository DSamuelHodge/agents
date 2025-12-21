const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://127.0.0.1:8787';

export type AgentEvent =
  | { type: 'state'; data: unknown }
  | { type: 'state-update'; data: unknown }
  | { type: 'settings'; data: unknown; id?: string }
  | { type: 'settings-updated'; data: unknown }
  | { type: 'workflow'; data: unknown; id?: string }
  | { type: 'workflow-complete'; data: unknown; id?: string }
  | { type: 'workflow-error'; message: string; id?: string }
  | { type: 'history'; data: unknown; id?: string }
  | { type: 'compare'; data: unknown; id?: string }
  | { type: 'export'; data: unknown; id?: string }
  | { type: 'pr-status'; data: unknown; id?: string }
  | { type: 'pr-diff'; data: unknown; id?: string }
  | { type: 'pr-comments'; data: unknown; id?: string }
  | { type: 'pr-comment-created'; data: unknown; id?: string }
  | { type: 'pr-approved'; data: unknown; id?: string }
  | { type: 'pr-merged'; data: unknown; id?: string }
  | { type: 'error'; message: string; id?: string };

export class WorkflowAgentClient {
  private ws?: WebSocket;
  private url: string;
  private pending: Map<string, (evt: AgentEvent) => void> = new Map();
  private listeners: Array<(evt: AgentEvent) => void> = [];

  constructor(instanceId: string = 'main') {
    const base = WORKER_URL.replace(/^http/, 'ws');
    this.url = `${base}/workflow-agent/${encodeURIComponent(instanceId)}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => resolve();
        this.ws.onerror = (err) => {
          console.warn('Agent WebSocket connection failed, will use HTTP fallback:', err);
          resolve(); // Resolve anyway to allow HTTP fallback
        };
        this.ws.onmessage = (ev) => {
          try {
            const evt = JSON.parse(String(ev.data)) as AgentEvent;
            // Resolve pending by id first
            const id = (evt as any)?.id as string | undefined;
            if (id && this.pending.has(id)) {
              const cb = this.pending.get(id)!;
              this.pending.delete(id);
              cb(evt);
              return;
            }
            // Broadcast to listeners
            this.listeners.forEach(fn => fn(evt));
          } catch {
            // ignore parse errors
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  onEvent(listener: (evt: AgentEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private send(action: string, payload?: unknown): Promise<AgentEvent> {
    const id = crypto.randomUUID();
    const msg = JSON.stringify({ action, payload, id });
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      this.pending.set(id, resolve);
      this.ws.send(msg);
      // Optional timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Agent request timed out'));
        }
      }, 30000);
    });
  }

  async startWorkflow(featureRequest: string) {
    const evt = await this.send('start-workflow', { featureRequest });
    if (evt.type === 'workflow-complete') return evt.data as unknown;
    if (evt.type === 'workflow-error') throw new Error(evt.message);
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async getWorkflow(id: string) {
    const evt = await this.send('get-workflow', { id });
    if (evt.type === 'workflow') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async getSettings() {
    const evt = await this.send('get-settings');
    if (evt.type === 'settings') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async updateSettings(settings: Record<string, unknown>) {
    const evt = await this.send('update-settings', settings);
    if (evt.type === 'settings') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async getHistory(limit = 50) {
    const evt = await this.send('get-history', { limit });
    if (evt.type === 'history') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async compareWorkflows(a: string, b: string) {
    const evt = await this.send('compare-workflows', { a, b });
    if (evt.type === 'compare') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async exportWorkflow(id: string) {
    const evt = await this.send('export-workflow', { id });
    if (evt.type === 'export') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async getPullRequestStatus(prNumber: number) {
    const evt = await this.send('get-pr-status', { prNumber });
    if (evt.type === 'pr-status') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async getPullRequestDiff(prNumber: number) {
    const evt = await this.send('get-pr-diff', { prNumber });
    if (evt.type === 'pr-diff') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async listPullRequestReviewComments(prNumber: number) {
    const evt = await this.send('list-pr-comments', { prNumber });
    if (evt.type === 'pr-comments') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async createPullRequestReviewComment(input: { prNumber: number; path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }) {
    const evt = await this.send('create-pr-comment', input);
    if (evt.type === 'pr-comment-created') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async approvePullRequest(prNumber: number, notes?: string) {
    const evt = await this.send('approve-pr', { prNumber, notes });
    if (evt.type === 'pr-approved') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }

  async mergePullRequest(input: { prNumber: number; method?: 'merge' | 'squash' | 'rebase'; notes?: string }) {
    const evt = await this.send('merge-pr', input);
    if (evt.type === 'pr-merged') return evt.data as unknown;
    if (evt.type === 'error') throw new Error(evt.message);
    return evt;
  }
}

export const agentClient = new WorkflowAgentClient('main');

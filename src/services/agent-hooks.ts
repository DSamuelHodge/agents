import { useAgent } from 'agents/react';
import { useCallback, useEffect, useState } from 'react';
import type { WorkflowState } from '../../worker/src/agents/workflow-agent';

/**
 * Hook to connect to WorkflowAgent with automatic state synchronization
 * 
 * @param instanceId - Unique identifier for the agent instance (e.g., 'main', 'session-123')
 * @returns Agent client with state and methods
 */
export function useWorkflowAgent(instanceId: string = 'main') {
  const resolvedHost = (() => {
    try {
      const url = import.meta.env?.VITE_WORKER_URL as string | undefined;
      if (url) return new URL(url).host;
    } catch (error) {
      console.warn('Failed to parse VITE_WORKER_URL:', error);
    }
    return typeof window !== 'undefined' ? window.location.host : '127.0.0.1:8787';
  })();
  const agent = useAgent<WorkflowState>({
    agent: 'workflow-agent',  // Class name in kebab-case
    name: instanceId,
    host: resolvedHost,
    onStateUpdate: (_state, source) => {
      console.log('Workflow state updated by:', source === 'server' ? 'server' : 'client');
    }
  });

  return agent;
}

/**
 * Hook for workflow execution with real-time updates
 * 
 * @param instanceId - Agent instance identifier
 * @returns Workflow control methods and state
 */
export function useWorkflowExecution(instanceId: string = 'main') {
  const resolvedHost = (() => {
    try {
      const url = import.meta.env?.VITE_WORKER_URL as string | undefined;
      if (url) return new URL(url).host;
    } catch (error) {
      console.warn('Failed to parse VITE_WORKER_URL:', error);
    }
    return typeof window !== 'undefined' ? window.location.host : '127.0.0.1:8787';
  })();
  const agent = useAgent<WorkflowState>({
    agent: 'workflow-agent',
    name: instanceId,
    host: resolvedHost
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<Record<string, unknown> | null>(null);

  // Start a new workflow
  const startWorkflow = useCallback(async (featureRequest: string) => {
    setIsRunning(true);
    setError(null);

    try {
      const result = await agent.call('startWorkflow', [featureRequest]) as Record<string, unknown>;
      setCurrentWorkflow(result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start workflow';
      setError(errorMsg);
      throw err;
    } finally {
      setIsRunning(false);
    }
  }, [agent]);

  // Get a specific workflow by ID
  const getWorkflow = useCallback(async (workflowId: string): Promise<Record<string, unknown> | null> => {
    try {
      const result = await agent.call('getWorkflow', [workflowId]) as Record<string, unknown>;
      return result as Record<string, unknown>;
    } catch (err) {
      console.error('Failed to get workflow:', err);
      return null;
    }
  }, [agent]);

  // Get workflow history
  const getHistory = useCallback(async (limit: number = 50): Promise<Record<string, unknown>[]> => {
    try {
      const result = await agent.call('getHistory', [limit]) as Record<string, unknown>[];
      return result as Record<string, unknown>[];
    } catch (err) {
      console.error('Failed to get history:', err);
      return [];
    }
  }, [agent]);

  // Get audit trail for a workflow
  const getAudit = useCallback(async (auditId: string): Promise<Record<string, unknown>[]> => {
    try {
      const result = await agent.call('getAudit', [auditId]) as Record<string, unknown>[];
      return result as Record<string, unknown>[];
    } catch (err) {
      console.error('Failed to get audit:', err);
      return [];
    }
  }, [agent]);

  // Compare two workflows
  const compareWorkflows = useCallback(async (workflowIdA: string, workflowIdB: string): Promise<Record<string, unknown> | null> => {
    try {
      const result = await agent.call('compareWorkflows', [workflowIdA, workflowIdB]) as Record<string, unknown>;
      return result as Record<string, unknown>;
    } catch (err) {
      console.error('Failed to compare workflows:', err);
      return null;
    }
  }, [agent]);

  // Export workflow with audit
  const exportWorkflow = useCallback(async (workflowId: string): Promise<Record<string, unknown> | null> => {
    try {
      const result = await agent.call('exportWorkflow', [workflowId]) as Record<string, unknown>;
      return result as Record<string, unknown>;
    } catch (err) {
      console.error('Failed to export workflow:', err);
      return null;
    }
  }, [agent]);

  return {
    agent,
    currentWorkflow,
    isRunning,
    error,
    startWorkflow,
    getWorkflow,
    getHistory,
    getAudit,
    compareWorkflows,
    exportWorkflow
  };
}

/**
 * Hook for application settings management
 * 
 * @param instanceId - Agent instance identifier
 * @returns Settings and update methods
 */
export function useWorkflowSettings(instanceId: string = 'main') {
  const resolvedHost = (() => {
    try {
      const url = import.meta.env?.VITE_WORKER_URL as string | undefined;
      if (url) return new URL(url).host;
    } catch (error) {
      console.warn('Failed to parse VITE_WORKER_URL:', error);
    }
    return typeof window !== 'undefined' ? window.location.host : '127.0.0.1:8787';
  })();
  const agent = useAgent<WorkflowState>({
    agent: 'workflow-agent',
    name: instanceId,
    host: resolvedHost
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  // Update settings
  const updateSettings = useCallback(async (newSettings: Record<string, unknown>) => {
    setLoading(true);
    setError(null);

    try {
      const updated = await agent.call('updateSettings', [newSettings]) as Record<string, unknown>;
      setSettings(updated);
      return updated;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update settings';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [agent]);

  // Refresh settings from server
  const refreshSettings = useCallback(async () => {
    try {
      const result = await agent.call('getSettings', []) as Record<string, unknown>;
      setSettings(result);
      return result;
    } catch (err) {
      console.error('Failed to refresh settings:', err);
    }
  }, [agent]);

  return {
    agent,
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings
  };
}

/**
 * Hook for monitoring WebSocket connection
 * 
 * @param instanceId - Agent instance identifier
 * @returns Connection status information
 */
export function useWorkflowConnection() {
  const [isConnected] = useState(true);
  const [activeConnections] = useState(0);
  const [lastUpdated] = useState<string | null>(null);

  return {
    isConnected,
    reconnectAttempts: 0,
    activeConnections,
    lastUpdated
  };
}

/**
 * Hook for workflow history with auto-refresh
 * 
 * @param instanceId - Agent instance identifier
 * @param limit - Maximum number of workflows to fetch
 * @param autoRefresh - Auto-refresh interval in ms (0 to disable)
 * @returns Workflow history and controls
 */
export function useWorkflowHistory(
  instanceId: string = 'main',
  limit: number = 50,
  autoRefresh: number = 0
) {
  const resolvedHost = (() => {
    try {
      const url = import.meta.env?.VITE_WORKER_URL as string | undefined;
      if (url) return new URL(url).host;
    } catch (error) {
      console.warn('Failed to parse VITE_WORKER_URL:', error);
    }
    return typeof window !== 'undefined' ? window.location.host : '127.0.0.1:8787';
  })();
  const agent = useAgent<WorkflowState>({
    agent: 'workflow-agent',
    name: instanceId,
    host: resolvedHost
  });
  
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load history
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await agent.call('getHistory', [limit]) as Record<string, unknown>[];
      setHistory((result as Record<string, unknown>[]) || []);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load history';
      setError(errorMsg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [agent, limit]);

  // Initial load
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh > 0) {
      const interval = setInterval(loadHistory, autoRefresh);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, loadHistory]);

  return {
    history,
    loading,
    error,
    refresh: loadHistory
  };
}

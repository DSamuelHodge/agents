import { useEffect, useMemo, useState } from 'react';
import { Activity, Users, Zap, CheckCircle, AlertCircle, Code, Database, Settings, TestTube, BookOpen, Briefcase, Layers } from 'lucide-react';
import { apiClient } from '../services/api';
import { agentClient } from '../services/agent';
import type {
  WorkflowRun,
  AgentStep,
  PullRequestStatus,
  PullRequestDiff,
  PullRequestReviewComment,
  WorkflowHistoryItem,
  WorkflowCompareResponse,
  AppSettings
} from '../services/api';

// Role definitions matching your 190-role taxonomy
const roles = [
  { 
    id: 'pm', 
    name: 'Product Manager', 
    icon: Briefcase,
    tier: 'strategy',
    description: 'Defines features and requirements',
    systemPrompt: `You are a Product Manager. You translate business needs into clear feature specifications.
Your output must include:
1. User Story (As a [user], I want [feature], so that [benefit])
2. Acceptance Criteria (measurable success conditions)
3. Priority (P0/P1/P2)
4. Estimated Complexity (S/M/L/XL)

Format as structured markdown. Be specific and measurable.`
  },
  { 
    id: 'architect', 
    name: 'System Architect', 
    icon: Layers,
    tier: 'strategy',
    description: 'Designs technical architecture',
    systemPrompt: `You are a System Architect. You design scalable, maintainable technical solutions.
Your output must include:
1. Architecture Diagram (describe components and data flow)
2. Technology Stack (specific tools/frameworks)
3. API Contract (endpoints, methods, payloads)
4. Database Schema (tables, relationships)
5. Deployment Strategy

Consider security, scalability, and maintainability.`
  },
  { 
    id: 'frontend', 
    name: 'Frontend Developer', 
    icon: Code,
    tier: 'development',
    description: 'Builds user interfaces',
    systemPrompt: `You are a Frontend Developer specializing in React and modern web technologies.
Given a feature spec and API contract, you create:
1. Component structure (React functional components)
2. State management approach
3. API integration layer
4. Responsive design considerations

Output actual code snippets with explanations. Use modern best practices.`
  },
  { 
    id: 'backend', 
    name: 'Backend Developer', 
    icon: Database,
    tier: 'development',
    description: 'Builds APIs and business logic',
    systemPrompt: `You are a Backend Developer specializing in API design and business logic.
Given architecture specs, you create:
1. API endpoint implementations
2. Business logic/validation
3. Database queries
4. Error handling

Provide code examples. Consider performance and security.`
  },
  { 
    id: 'database', 
    name: 'Database Engineer', 
    icon: Database,
    tier: 'development',
    description: 'Designs and optimizes data layer',
    systemPrompt: `You are a Database Engineer. You design efficient, normalized database schemas.
Your output includes:
1. Table definitions (columns, types, constraints)
2. Indexes for performance
3. Relationships and foreign keys
4. Migration scripts
5. Query optimization suggestions

Use SQL syntax. Explain design decisions.`
  },
  { 
    id: 'devops', 
    name: 'DevOps Engineer', 
    icon: Settings,
    tier: 'development',
    description: 'Handles deployment and infrastructure',
    systemPrompt: `You are a DevOps Engineer specializing in Cloudflare Workers and modern deployment.
Your output includes:
1. Deployment configuration (wrangler.toml)
2. Environment variables
3. CI/CD pipeline steps
4. Monitoring/logging setup
5. Rollback procedures

Provide concrete configurations. Consider security and reliability.`
  },
  { 
    id: 'qa', 
    name: 'QA Engineer', 
    icon: TestTube,
    tier: 'quality',
    description: 'Tests and validates features',
    systemPrompt: `You are a QA Engineer. You create comprehensive test plans.
Your output includes:
1. Test scenarios (happy path, edge cases, error cases)
2. Test data requirements
3. Expected vs actual results format
4. Automated test pseudocode
5. Manual testing checklist

Be thorough. Think about what could break.`
  },
  { 
    id: 'tech_writer', 
    name: 'Technical Writer', 
    icon: BookOpen,
    tier: 'quality',
    description: 'Documents features and APIs',
    systemPrompt: `You are a Technical Writer. You create clear, user-friendly documentation.
Your output includes:
1. User-facing feature documentation
2. API documentation (endpoints, parameters, examples)
3. Setup/installation instructions
4. Troubleshooting guide
5. Code examples

Write for both developers and end-users. Be clear and concise.`
  },
  { 
    id: 'project_mgr', 
    name: 'Project Manager', 
    icon: Activity,
    tier: 'orchestration',
    description: 'Coordinates team workflow',
    systemPrompt: `You are a Project Manager. You coordinate the team and ensure workflow efficiency.
Given a feature request, you:
1. Break it into sequential tasks
2. Assign tasks to specific roles (PM → Architect → Frontend/Backend → QA → Tech Writer)
3. Identify dependencies
4. Estimate timeline
5. Monitor progress and blockers

Output a clear task sequence with role assignments.`
  }
];

interface WorkflowStep {
  roleId: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  output?: string;
  error?: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: string;
}

const WorkflowVisualizer = ({ workflow }: { workflow: WorkflowStep[] }) => {
  const getTierColor = (tier: string) => {
    switch(tier) {
      case 'strategy': return 'bg-purple-500';
      case 'development': return 'bg-blue-500';
      case 'quality': return 'bg-green-500';
      case 'orchestration': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      {workflow.map((step, idx) => {
        const role = roles.find(r => r.id === step.roleId);
        const Icon = role?.icon || Activity;
        return (
          <div key={idx} className="flex items-start gap-4" role="article" aria-label={`${role?.name} step`}>
            <div className="flex flex-col items-center">
              <div 
                className={`w-12 h-12 rounded-full ${getTierColor(role?.tier || 'default')} flex items-center justify-center text-white`}
                role="img"
                aria-label={`${role?.name} icon`}
              >
                <Icon size={24} aria-hidden="true" />
              </div>
              {idx < workflow.length - 1 && (
                <div className="w-0.5 h-16 bg-gray-300 my-2" aria-hidden="true"></div>
              )}
            </div>
            <div className="flex-1 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">{role?.name}</h4>
                <span 
                  className={`px-2 py-1 text-xs rounded-full ${
                    step.status === 'completed' ? 'bg-green-100 text-green-800' :
                    step.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-600'
                  }`}
                  role="status"
                  aria-label={`Status: ${step.status}`}
                >
                  {step.status}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{step.task}</p>
              {step.output && (
                <div className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={14} className="text-green-500" />
                    <span className="text-gray-700 font-semibold">Output Generated</span>
                  </div>
                  <div className="text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {step.output.substring(0, 500)}{step.output.length > 500 ? '...' : ''}
                  </div>
                </div>
              )}
              {step.error && (
                <div className="mt-2 p-3 bg-red-50 rounded text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={14} className="text-red-500" />
                    <span className="text-red-700 font-semibold">Error</span>
                  </div>
                  <div className="text-red-600">{step.error}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function DigitalTwinMVP() {
  const [featureRequest, setFeatureRequest] = useState('');
  const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<WorkflowRun | null>(null);

  const [prStatus, setPrStatus] = useState<PullRequestStatus | null>(null);
  const [prDiff, setPrDiff] = useState<PullRequestDiff | null>(null);
  const [prComments, setPrComments] = useState<PullRequestReviewComment[]>([]);
  const [prUiError, setPrUiError] = useState<string | null>(null);
  const [isLoadingPrData, setIsLoadingPrData] = useState(false);

  const [commentPath, setCommentPath] = useState('');
  const [commentLine, setCommentLine] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  const [historyItems, setHistoryItems] = useState<WorkflowHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareResult, setCompareResult] = useState<WorkflowCompareResponse | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const [approvalNotes, setApprovalNotes] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const [, setSettings] = useState<AppSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsOwner, setSettingsOwner] = useState('');
  const [settingsRepo, setSettingsRepo] = useState('');
  const [settingsAutoMerge, setSettingsAutoMerge] = useState(false);
  const [settingsRequiredApprovals, setSettingsRequiredApprovals] = useState('1');
  const [settingsRequiredReviewers, setSettingsRequiredReviewers] = useState('');
  const [settingsDeploymentEnv, setSettingsDeploymentEnv] = useState('');

  // Live Worker status
  const [workerHealthy, setWorkerHealthy] = useState<boolean | null>(null);
  const [workerStatusError, setWorkerStatusError] = useState<string | null>(null);

  const prNumber = useMemo(() => {
    const n = lastResult?.prNumber;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
  }, [lastResult?.prNumber]);

  const statusPillClasses = (label: PullRequestStatus['label']) => {
    switch (label) {
      case 'merged':
        return 'bg-green-100 text-green-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'open':
        return 'bg-gray-100 text-gray-700';
      case 'closed':
        return 'bg-gray-200 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const refreshPrData = async () => {
    if (!prNumber) return;

    setIsLoadingPrData(true);
    setPrUiError(null);

    try {
      const [status, diff, commentsResp] = await Promise.all([
        apiClient.getPullRequestStatus(prNumber),
        apiClient.getPullRequestDiff(prNumber),
        apiClient.listPullRequestReviewComments(prNumber)
      ]);

      setPrStatus(status);
      setPrDiff(diff);
      setPrComments(commentsResp.comments);

      // set defaults for comment form
      if (!commentPath && diff.files.length > 0) {
        setCommentPath(diff.files[0]?.filename ?? '');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load PR data';
      setPrUiError(msg);
    } finally {
      setIsLoadingPrData(false);
    }
  };

  const refreshHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await apiClient.listWorkflowHistory(50, true);
      setHistoryItems(res.items);

      // Initialize compare selections if not set.
      if (!compareA && res.items.length > 0) {
        setCompareA(res.items[0]?.id ?? '');
      }
      if (!compareB && res.items.length > 1) {
        setCompareB(res.items[1]?.id ?? res.items[0]?.id ?? '');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load workflow history';
      setHistoryError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const refreshSettings = async () => {
    setIsLoadingSettings(true);
    setSettingsError(null);
    try {
      const s = await apiClient.getSettings();
      setSettings(s);
      setSettingsOwner(s.github.owner);
      setSettingsRepo(s.github.repo);
      setSettingsAutoMerge(Boolean(s.autoMerge));
      setSettingsRequiredApprovals(String(s.requiredApprovals ?? 1));
      setSettingsRequiredReviewers((s.requiredReviewers ?? []).join(', '));
      setSettingsDeploymentEnv(s.deploymentEnvironment ?? '');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load settings';
      setSettingsError(msg);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
    void refreshSettings();
    // Live status heartbeat
    const pollStatus = async () => {
      try {
        // Use legacy /status endpoint which works reliably
        const res = await apiClient.getStatus();
        setWorkerHealthy(res?.ok === true);
        setWorkerStatusError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Worker status unavailable';
        setWorkerHealthy(false);
        setWorkerStatusError(msg);
      }
    };
    void pollStatus();
    const statusTimer = window.setInterval(pollStatus, 10000);
    return () => {
      if (statusTimer) window.clearInterval(statusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPrStatus(null);
    setPrDiff(null);
    setPrComments([]);
    setPrUiError(null);
    setCommentPath('');
    setCommentLine('');
    setCommentBody('');
    setApprovalNotes('');

    if (!prNumber) return;

    void refreshPrData();
    const interval = window.setInterval(() => {
      void refreshPrData();
    }, 10000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prNumber]);

  const addLog = (message: string, type = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  };

  const runWorkflow = async (isRetry = false) => {
    if (!featureRequest.trim()) {
      setLastError('Please enter a feature request');
      return;
    }
    
    setIsProcessing(true);
    setWorkflow([]);
    setLogs([]);
    setLastError(null);
    setLastResult(null);
    
    if (!isRetry) {
      setRetryCount(0);
    }
    
    addLog(isRetry ? '🔄 Retrying workflow...' : '🚀 Starting Digital Twin workflow via Worker API...', 'system');
    
    try {
      const result = await apiClient.runWorkflow(featureRequest);

      setLastResult(result);
      void refreshHistory();
      
      addLog(`✅ Workflow ${result.id} completed`, 'success');
      
      // Transform steps for UI
      const uiSteps: WorkflowStep[] = result.steps.map((step: AgentStep) => {
        const role = roles.find(r => r.id === step.roleId);
        return {
          roleId: step.roleId,
          task: role?.description || step.roleId,
          status: step.status as WorkflowStep['status'],
          output: step.output,
          error: step.error
        };
      });
      
      // Simulate progressive reveal for better UX
      for (let i = 0; i < uiSteps.length; i++) {
        const step = uiSteps[i];
        const role = roles.find(r => r.id === step.roleId);
        
        setWorkflow(prev => [...prev, { ...step, status: 'in_progress' }]);
        addLog(`🤖 ${role?.name} processing...`, 'agent');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setWorkflow(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: step.status, output: step.output, error: step.error } : s
        ));
        
        if (step.status === 'completed') {
          addLog(`✅ ${role?.name} completed`, 'success');
        } else if (step.status === 'failed') {
          addLog(`❌ ${role?.name} failed: ${step.error}`, 'error');
        }
      }
      
      addLog('🎉 Feature development complete!', 'success');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMsg);
      setRetryCount(prev => prev + 1);
      
      addLog(`❌ Workflow failed: ${errorMsg}`, 'error');
      
      // Show error in UI
      setWorkflow(prev => [...prev, {
        roleId: 'error',
        task: 'Error',
        status: 'failed',
        error: errorMsg
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const historyStatusPill = (item: WorkflowHistoryItem) => {
    const merged = item.pr?.state === 'merged' || item.pr?.merged === true;
    const openApproved = item.pr?.state === 'open' && (item.pr?.approvals ?? 0) > 0;

    if (merged) return { text: 'merged', cls: 'bg-green-100 text-green-800' };
    if (openApproved) return { text: 'approved', cls: 'bg-blue-100 text-blue-800' };
    if (item.status === 'failed') return { text: 'failed', cls: 'bg-red-100 text-red-800' };
    if (item.status === 'completed') return { text: 'completed', cls: 'bg-green-100 text-green-800' };
    if (item.status === 'in_progress') return { text: 'in_progress', cls: 'bg-blue-100 text-blue-800' };
    return { text: String(item.status), cls: 'bg-gray-100 text-gray-700' };
  };

  const handleRetry = () => {
    runWorkflow(true);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Activity className="text-purple-600" size={32} />
                Digital Twin MVP
              </h1>
              <p className="text-gray-600 mt-1">9-Agent Synthetic Development Team</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gray-400" />
                  <span className="text-gray-600">9 Active Agents</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap size={16} className={workerHealthy ? 'text-green-500' : workerHealthy === false ? 'text-red-500' : 'text-gray-400'} />
                  <span className={workerHealthy ? 'text-green-600' : workerHealthy === false ? 'text-red-600' : 'text-gray-500'}>
                    {workerHealthy === null ? 'Checking Worker…' : workerHealthy ? 'Worker: Live' : 'Worker: Unreachable'}
                  </span>
                </div>
              </div>
              {workerStatusError && (
                <div className="mt-2 text-xs p-2 bg-red-50 border border-red-200 rounded text-red-700" role="alert" aria-live="polite">
                  {workerStatusError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Input & Logs */}
          <div className="lg:col-span-1 space-y-6">
            {/* Feature Request Input */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Feature Request</h3>
              <textarea
                id="feature-request"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 placeholder:text-gray-500"
                rows={4}
                placeholder="Describe the feature you want to build..."
                value={featureRequest}
                onChange={(e) => setFeatureRequest(e.target.value)}
                disabled={isProcessing}
              />
              
              
              {lastError && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700" role="alert" aria-live="polite">
                  <AlertCircle size={20} aria-hidden="true" />
                  <span className="flex-1">{lastError}</span>
                  {retryCount > 0 && retryCount < 3 && (
                    <button
                      onClick={handleRetry}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                      aria-label="Retry workflow"
                    >
                      Retry ({retryCount}/3)
                    </button>
                  )}
                </div>
              )}
              
              <button
                onClick={() => runWorkflow(false)}
                disabled={isProcessing || !featureRequest.trim()}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                aria-label="Start feature development"
                aria-busy={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" aria-hidden="true"></div>
                    Processing... ({workflow.filter(s => s.status === 'completed').length}/{roles.length} steps)
                  </>
                ) : (
                  <>
                    <Zap size={18} aria-hidden="true" />
                    Start Development
                  </>
                )}
              </button>
            </div>

            {/* Settings Panel (E4-T004) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
                <button
                  onClick={() => void refreshSettings()}
                  disabled={isLoadingSettings || isSavingSettings}
                  className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                  aria-label="Reload settings"
                >
                  Reload
                </button>
              </div>

              {settingsError && (
                <div className="mb-3 text-xs p-2 bg-red-50 border border-red-200 rounded text-red-700" role="alert" aria-live="polite">
                  {settingsError}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block" htmlFor="settings-owner">
                    <span className="text-xs text-gray-600">GitHub organization or user</span>
                    <input
                      id="settings-owner"
                      className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500"
                      value={settingsOwner}
                      onChange={(e) => setSettingsOwner(e.target.value)}
                      placeholder="org or user, e.g. microsoft"
                      disabled={isLoadingSettings || isSavingSettings}
                      aria-describedby="settings-owner-help"
                    />
                    <span id="settings-owner-help" className="sr-only">Enter GitHub organization or username</span>
                  </label>

                  <label className="block" htmlFor="settings-repo">
                    <span className="text-xs text-gray-600">GitHub repository name</span>
                    <input
                      id="settings-repo"
                      className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500"
                      value={settingsRepo}
                      onChange={(e) => setSettingsRepo(e.target.value)}
                      placeholder="repo name, e.g. agents"
                      disabled={isLoadingSettings || isSavingSettings}
                      aria-describedby="settings-repo-help"
                    />
                    <span id="settings-repo-help" className="sr-only">Enter GitHub repository name</span>
                  </label>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsAutoMerge}
                    onChange={(e) => setSettingsAutoMerge(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                  />
                  <span className="text-sm text-gray-700">Auto-merge when approved</span>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block" htmlFor="settings-approvals">
                    <span className="text-xs text-gray-600">Required approvals</span>
                    <input
                      id="settings-approvals"
                      type="number"
                      min={1}
                      className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500"
                      value={settingsRequiredApprovals}
                      onChange={(e) => setSettingsRequiredApprovals(e.target.value)}
                      disabled={isLoadingSettings || isSavingSettings}
                    />
                  </label>

                  <label className="block" htmlFor="settings-deploy-env">
                    <span className="text-xs text-gray-600">Deployment environment</span>
                    <input
                      id="settings-deploy-env"
                      className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500"
                      value={settingsDeploymentEnv}
                      onChange={(e) => setSettingsDeploymentEnv(e.target.value)}
                      placeholder="e.g. staging, production"
                      disabled={isLoadingSettings || isSavingSettings}
                    />
                  </label>
                </div>

                <label className="block" htmlFor="settings-reviewers">
                  <span className="text-xs text-gray-600">Required reviewers (comma-separated GitHub logins)</span>
                  <input
                    id="settings-reviewers"
                    className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500"
                    value={settingsRequiredReviewers}
                    onChange={(e) => setSettingsRequiredReviewers(e.target.value)}
                    placeholder="comma-separated logins, e.g. alice, bob"
                    disabled={isLoadingSettings || isSavingSettings}
                  />
                </label>

                <button
                  onClick={async () => {
                    setIsSavingSettings(true);
                    setSettingsError(null);
                    try {
                      const reviewers = settingsRequiredReviewers
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean);
                      const requiredApprovals = Number(settingsRequiredApprovals);

                      const updated = await apiClient.updateSettings({
                        github: { owner: settingsOwner.trim(), repo: settingsRepo.trim() },
                        autoMerge: settingsAutoMerge,
                        requiredApprovals: Number.isFinite(requiredApprovals) ? requiredApprovals : undefined,
                        requiredReviewers: reviewers,
                        deploymentEnvironment: settingsDeploymentEnv.trim() || undefined,
                      });
                      setSettings(updated);

                      if (prNumber) {
                        await refreshPrData();
                      }
                      void refreshHistory();
                    } catch (error) {
                      const msg = error instanceof Error ? error.message : 'Failed to save settings';
                      setSettingsError(msg);
                    } finally {
                      setIsSavingSettings(false);
                    }
                  }}
                  disabled={isLoadingSettings || isSavingSettings}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
                  aria-label="Save settings"
                >
                  {isSavingSettings ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* Code Quality & Artifacts */}
            {(lastResult?.quality || lastResult?.artifactUrl) && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Code Quality</h3>

                {lastResult?.artifactUrl && (
                  <div className="mb-4">
                    <div className="text-sm text-gray-700">Generated PR</div>
                    <a
                      className="text-sm text-purple-600 hover:text-purple-700 underline break-all"
                      href={lastResult.artifactUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lastResult.artifactUrl}
                    </a>
                    {typeof lastResult.prNumber === 'number' && (
                      <div className="text-xs text-gray-500 mt-1">PR #{lastResult.prNumber}{lastResult.branch ? ` · ${lastResult.branch}` : ''}</div>
                    )}

                    {prNumber && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-gray-700">PR Status</div>
                          <button
                            onClick={() => void refreshPrData()}
                            disabled={isLoadingPrData}
                            className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                            aria-label="Refresh PR status"
                          >
                            Refresh
                          </button>
                        </div>

                        {prUiError && (
                          <div className="text-xs p-2 bg-red-50 border border-red-200 rounded text-red-700" role="alert" aria-live="polite">
                            {prUiError}
                          </div>
                        )}

                        {prStatus ? (
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${statusPillClasses(prStatus.label)}`}
                              role="status"
                              aria-label={`PR status ${prStatus.label}`}
                            >
                              {prStatus.label}
                            </span>
                            <span className="text-xs text-gray-500">Approvals: {prStatus.approvals}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">{isLoadingPrData ? 'Loading…' : 'No status loaded'}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {lastResult?.quality && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700">Score</div>
                      <div className="text-sm font-semibold text-gray-900">{lastResult.quality.score}/100</div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-2 rounded border border-gray-200 bg-gray-50">
                        <div className="text-xs text-gray-500">Errors</div>
                        <div className="text-sm font-semibold text-red-600">{lastResult.quality.errors}</div>
                      </div>
                      <div className="p-2 rounded border border-gray-200 bg-gray-50">
                        <div className="text-xs text-gray-500">Warnings</div>
                        <div className="text-sm font-semibold text-yellow-700">{lastResult.quality.warnings}</div>
                      </div>
                      <div className="p-2 rounded border border-gray-200 bg-gray-50">
                        <div className="text-xs text-gray-500">Coverage</div>
                        <div className="text-sm font-semibold text-gray-900">{lastResult.quality.coverageEstimate}%</div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      {lastResult.qualityGatePassed ? 'Quality gate passed' : 'Quality gate failed'}
                      {typeof lastResult.quality.formattedFiles === 'number' ? ` · Formatted ${lastResult.quality.formattedFiles} files` : ''}
                    </div>

                    {lastResult.quality.issues.length > 0 && (
                      <div className="pt-2">
                        <div className="text-sm font-semibold text-gray-900 mb-2">Top Findings</div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {lastResult.quality.issues.slice(0, 8).map((issue, idx) => (
                            <div key={idx} className="text-xs p-2 bg-gray-50 border border-gray-200 rounded">
                              <div className="flex items-center justify-between gap-2">
                                <span className={issue.severity === 'error' ? 'text-red-600 font-semibold' : 'text-yellow-700 font-semibold'}>
                                  {issue.severity}
                                </span>
                                <span className="text-gray-500">{issue.tool}</span>
                              </div>
                              <div className="text-gray-700 font-mono break-all mt-1">{issue.filePath}</div>
                              <div className="text-gray-600 mt-1">{issue.message}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Approval UI (E4-T003) */}
            {prNumber && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Approval</h3>

                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-2 rounded border border-gray-200 bg-gray-50">
                      <div className="text-xs text-gray-500">Quality</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {typeof lastResult?.quality?.score === 'number' ? `${lastResult.quality.score}/100` : '—'}
                      </div>
                    </div>
                    <div className="p-2 rounded border border-gray-200 bg-gray-50">
                      <div className="text-xs text-gray-500">Errors</div>
                      <div className="text-sm font-semibold text-red-600">
                        {typeof lastResult?.quality?.errors === 'number' ? lastResult.quality.errors : '—'}
                      </div>
                    </div>
                    <div className="p-2 rounded border border-gray-200 bg-gray-50">
                      <div className="text-xs text-gray-500">PR</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {prStatus ? `${prStatus.approvals}/${prStatus.requiredApprovals}` : '—'}
                      </div>
                    </div>
                  </div>

                  {lastResult?.quality?.issues?.length ? (
                    <div>
                      <div className="text-sm font-semibold text-gray-900 mb-2">Issues needing review</div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {lastResult.quality.issues
                          .filter(i => i.severity === 'error')
                          .slice(0, 8)
                          .map((issue, idx) => (
                            <div key={idx} className="text-xs p-2 bg-red-50 border border-red-200 rounded">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-red-700 font-semibold">error</span>
                                <span className="text-gray-500">{issue.tool}</span>
                              </div>
                              <div className="text-gray-700 font-mono break-all mt-1">{issue.filePath}</div>
                              <div className="text-red-700 mt-1">{issue.message}</div>
                            </div>
                          ))}
                        {lastResult.quality.issues.filter(i => i.severity === 'error').length === 0 && (
                          <div className="text-xs text-gray-500">No error-level issues found.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No lint/test issues reported.</div>
                  )}

                  <label className="block">
                    <span className="text-xs text-gray-600">Notes (included in approval/merge)</span>
                    <textarea
                      className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm"
                      rows={3}
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      placeholder="Optional notes for reviewers / audit…"
                      disabled={isApproving || isMerging}
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        if (!prNumber) return;
                        setIsApproving(true);
                        setPrUiError(null);
                        try {
                          await apiClient.approvePullRequest(prNumber, approvalNotes.trim() || undefined);
                          await refreshPrData();
                          void refreshHistory();
                        } catch (error) {
                          const msg = error instanceof Error ? error.message : 'Approve failed';
                          setPrUiError(msg);
                        } finally {
                          setIsApproving(false);
                        }
                      }}
                      disabled={isApproving || isMerging || !prStatus || prStatus.state !== 'open'}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
                      aria-label="Approve pull request"
                    >
                      {isApproving ? 'Approving…' : 'Approve'}
                    </button>

                    <button
                      onClick={async () => {
                        if (!prNumber) return;
                        setIsMerging(true);
                        setPrUiError(null);
                        try {
                          await apiClient.mergePullRequest({
                            prNumber,
                            method: 'squash',
                            notes: approvalNotes.trim() || undefined
                          });
                          await refreshPrData();
                          void refreshHistory();
                        } catch (error) {
                          const msg = error instanceof Error ? error.message : 'Merge failed';
                          setPrUiError(msg);
                        } finally {
                          setIsMerging(false);
                        }
                      }}
                      disabled={
                        isApproving ||
                        isMerging ||
                        !prStatus ||
                        prStatus.state !== 'open' ||
                        prStatus.approvals < prStatus.requiredApprovals ||
                        (prStatus.missingReviewers?.length ?? 0) > 0
                      }
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
                      aria-label="Merge pull request"
                    >
                      {isMerging ? 'Merging…' : 'Merge'}
                    </button>
                  </div>

                  {prStatus && prStatus.approvals < prStatus.requiredApprovals && (
                    <div className="text-xs text-gray-500">
                      Merge requires {prStatus.requiredApprovals} approval(s). Current: {prStatus.approvals}.
                    </div>
                  )}

                  {prStatus && (prStatus.missingReviewers?.length ?? 0) > 0 && (
                    <div className="text-xs text-gray-500">
                      Missing required reviewer approval(s): {prStatus.missingReviewers?.join(', ')}.
                    </div>
                  )}

                  {lastResult?.qualityGatePassed === false && (
                    <div className="text-xs text-gray-500">
                      Quality gate failed (errors present). Review before merging.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PR Diff & Inline Review Comments */}
            {prNumber && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">PR Review</h3>
                  <div className="text-xs text-gray-500">Auto-refreshes every 10s</div>
                </div>

                {/* Diff */}
                <div className="mb-6">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Diff vs main</div>
                  {prDiff?.files?.length ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {prDiff.files.slice(0, 12).map((f) => (
                        <div key={f.filename} className="border border-gray-200 rounded">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                            <div className="text-xs font-mono text-gray-800 break-all">{f.filename}</div>
                            <div className="text-xs text-gray-500">+{f.additions} −{f.deletions}</div>
                          </div>
                          <pre className="text-xs font-mono p-3 whitespace-pre-wrap overflow-x-auto">
                            {(f.patch && f.patch.trim().length > 0) ? f.patch : 'No patch available (binary file or large diff).'}
                          </pre>
                        </div>
                      ))}
                      {prDiff.files.length > 12 && (
                        <div className="text-xs text-gray-500">Showing first 12 files.</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">{isLoadingPrData ? 'Loading diff…' : 'No diff loaded'}</div>
                  )}
                </div>

                {/* Comments */}
                <div className="mb-6">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Inline review comments</div>
                  {prComments.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {prComments.slice(0, 20).map((c) => (
                        <div key={c.id} className="p-2 bg-gray-50 border border-gray-200 rounded">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-gray-700">
                              <span className="font-semibold">{c.user}</span>
                              <span className="text-gray-500"> · {c.path}{c.line ? `:${c.line}` : ''}</span>
                            </div>
                            <a className="text-xs text-purple-600 hover:text-purple-700 underline" href={c.url} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          </div>
                          <div className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{c.body}</div>
                        </div>
                      ))}
                      {prComments.length > 20 && (
                        <div className="text-xs text-gray-500">Showing latest 20 comments.</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No inline comments yet.</div>
                  )}
                </div>

                {/* Inline comment form */}
                <div>
                  <div className="text-sm font-semibold text-gray-900 mb-2">Add inline comment</div>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="text-xs text-gray-600">File</span>
                      <select
                        className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                        value={commentPath}
                        onChange={(e) => setCommentPath(e.target.value)}
                        disabled={isPostingComment || !prDiff?.files?.length}
                      >
                        <option value="" disabled>Select a file</option>
                        {(prDiff?.files ?? []).map((f) => (
                          <option key={f.filename} value={f.filename}>{f.filename}</option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs text-gray-600">Line (1-based)</span>
                        <input
                          className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm"
                          value={commentLine}
                          onChange={(e) => setCommentLine(e.target.value)}
                          placeholder="e.g. 12"
                          inputMode="numeric"
                          disabled={isPostingComment}
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs text-gray-600">Side</span>
                        <select
                          className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                          defaultValue="RIGHT"
                          disabled
                          aria-label="Side (RIGHT)"
                        >
                          <option value="RIGHT">RIGHT (PR)</option>
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-xs text-gray-600">Comment</span>
                      <textarea
                        className="mt-1 w-full p-2 border border-gray-300 rounded-lg text-sm"
                        rows={3}
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Write a review comment…"
                        disabled={isPostingComment}
                      />
                    </label>

                    <button
                      onClick={async () => {
                        if (!prNumber) return;
                        const line = Number(commentLine);
                        if (!commentPath.trim() || !Number.isFinite(line) || line <= 0 || !commentBody.trim()) {
                          setPrUiError('File, line, and comment body are required.');
                          return;
                        }
                        setIsPostingComment(true);
                        setPrUiError(null);
                        try {
                          await apiClient.createPullRequestReviewComment({
                            prNumber,
                            path: commentPath.trim(),
                            line,
                            body: commentBody.trim(),
                            side: 'RIGHT'
                          });
                          setCommentBody('');
                          await refreshPrData();
                        } catch (error) {
                          const msg = error instanceof Error ? error.message : 'Failed to post comment';
                          setPrUiError(msg);
                        } finally {
                          setIsPostingComment(false);
                        }
                      }}
                      disabled={isPostingComment || isLoadingPrData || !commentPath.trim() || !commentBody.trim()}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
                      aria-label="Post inline review comment"
                    >
                      {isPostingComment ? 'Posting…' : 'Post comment'}
                    </button>
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    Note: GitHub may reject inline comments on some diffs; if that happens, use the PR link to comment directly.
                  </div>
                </div>
              </div>
            )}

            {/* Activity Logs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Activity Log</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No activity yet</p>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="text-xs flex gap-2 items-start">
                      <span className="text-gray-400 font-mono">{log.time}</span>
                      <span className={`flex-1 ${
                        log.type === 'success' ? 'text-green-600' :
                        log.type === 'error' ? 'text-red-600' :
                        log.type === 'agent' ? 'text-blue-600' :
                        'text-gray-600'
                      }`}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Workflow Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-6 text-gray-900">Workflow Progress</h3>
              {workflow.length === 0 ? (
                <div className="text-center py-20">
                  <Users size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-400">Submit a feature request to see the team in action</p>
                </div>
              ) : (
                <WorkflowVisualizer workflow={workflow} />
              )}
            </div>
          </div>
        </div>

        {/* Team Overview */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Team Roster</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map(role => {
              const Icon = role.icon;
              const isActive = workflow.some(s => s.roleId === role.id && s.status === 'in_progress');
              return (
                <div key={role.id} className={`p-4 rounded-lg border-2 transition-all ${
                  isActive ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <Icon size={24} className={isActive ? 'text-purple-600' : 'text-gray-400'} />
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900">{role.name}</h4>
                      <p className="text-xs text-gray-500">{role.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workflow History (E4-T002) */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Workflow History</h3>
            <button
              onClick={() => void refreshHistory()}
              disabled={isLoadingHistory}
              className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              aria-label="Refresh workflow history"
            >
              Refresh
            </button>
          </div>

          {historyError && (
            <div className="text-sm p-3 bg-red-50 border border-red-200 rounded text-red-700" role="alert" aria-live="polite">
              {historyError}
            </div>
          )}

          {!historyError && historyItems.length === 0 && (
            <div className="text-sm text-gray-500">{isLoadingHistory ? 'Loading…' : 'No past workflows yet.'}</div>
          )}

          {historyItems.length > 0 && (
            <div className="space-y-6">
              {/* List */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {historyItems.slice(0, 30).map(item => {
                  const pill = historyStatusPill(item);
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 p-3 border border-gray-200 rounded bg-gray-50">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${pill.cls}`}>{pill.text}</span>
                          <span className="text-xs text-gray-500 font-mono break-all">{item.id}</span>
                          {typeof item.prNumber === 'number' && (
                            <span className="text-xs text-gray-500">PR #{item.prNumber}</span>
                          )}
                          {item.pr?.state && (
                            <span className="text-xs text-gray-500">· {item.pr.state} ({item.pr.approvals} approvals)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-900 mt-1 line-clamp-2">
                          {item.featureRequest || '(no feature request)'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(item.createdAt).toLocaleString()} · Updated {new Date(item.updatedAt).toLocaleString()}
                          {typeof item.qualityScore === 'number' ? ` · Quality ${item.qualityScore}/100` : ''}
                          {typeof item.qualityGatePassed === 'boolean' ? (item.qualityGatePassed ? ' · Gate pass' : ' · Gate fail') : ''}
                        </div>
                        {item.artifactUrl && (
                          <a className="text-xs text-purple-600 hover:text-purple-700 underline break-all" href={item.artifactUrl} target="_blank" rel="noreferrer">
                            {item.artifactUrl}
                          </a>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const exported = await apiClient.exportWorkflowHistory(item.id);
                              downloadJson(`workflow-${item.id}.json`, exported);
                            } catch (error) {
                              const msg = error instanceof Error ? error.message : 'Export failed';
                              setHistoryError(msg);
                            }
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100"
                          aria-label={`Export workflow ${item.id}`}
                        >
                          Export
                        </button>
                      </div>
                    </div>
                  );
                })}
                {historyItems.length > 30 && (
                  <div className="text-xs text-gray-500">Showing latest 30 workflows.</div>
                )}
              </div>

              {/* Compare */}
              <div className="border-t border-gray-200 pt-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Compare two runs</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    value={compareA}
                    onChange={(e) => setCompareA(e.target.value)}
                    disabled={isComparing}
                    aria-label="Select run A"
                  >
                    {historyItems.map(i => (
                      <option key={i.id} value={i.id}>{i.id}</option>
                    ))}
                  </select>

                  <select
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    value={compareB}
                    onChange={(e) => setCompareB(e.target.value)}
                    disabled={isComparing}
                    aria-label="Select run B"
                  >
                    {historyItems.map(i => (
                      <option key={i.id} value={i.id}>{i.id}</option>
                    ))}
                  </select>

                  <button
                    onClick={async () => {
                      if (!compareA || !compareB) return;
                      setIsComparing(true);
                      setHistoryError(null);
                      try {
                        const res = await apiClient.compareWorkflowHistory(compareA, compareB);
                        setCompareResult(res);
                      } catch (error) {
                        const msg = error instanceof Error ? error.message : 'Compare failed';
                        setHistoryError(msg);
                      } finally {
                        setIsComparing(false);
                      }
                    }}
                    disabled={isComparing || !compareA || !compareB || compareA === compareB}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
                    aria-label="Compare workflows"
                  >
                    {isComparing ? 'Comparing…' : 'Compare'}
                  </button>
                </div>

                {compareResult && (
                  <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                    {compareResult.diff.map(d => (
                      <div key={d.roleId} className="border border-gray-200 rounded">
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                          <div className="text-xs font-semibold text-gray-900">{d.roleId}</div>
                          <div className={`text-xs ${d.same ? 'text-green-700' : 'text-yellow-700'}`}>{d.same ? 'same' : 'changed'}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                          <pre className="text-xs font-mono p-3 whitespace-pre-wrap border-t md:border-t-0 md:border-r border-gray-200 max-h-48 overflow-y-auto">
                            {d.a ? d.a.substring(0, 2000) : '(no output)'}
                          </pre>
                          <pre className="text-xs font-mono p-3 whitespace-pre-wrap border-t border-gray-200 max-h-48 overflow-y-auto">
                            {d.b ? d.b.substring(0, 2000) : '(no output)'}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
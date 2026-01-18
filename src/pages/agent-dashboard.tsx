import { useState } from 'react';
import { useWorkflowExecution, useWorkflowConnection } from '../services/agent-hooks';
import { Activity, Zap, CheckCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';

/**
 * Example Dashboard using Agents SDK
 * 
 * Demonstrates:
 * - Real-time WebSocket connection
 * - Automatic state synchronization
 * - Workflow execution with live updates
 * - Connection status monitoring
 */
export function AgentSDKDashboard() {
  const [featureRequest, setFeatureRequest] = useState('');
  
  // Connect to WorkflowAgent with automatic state sync
  const {
    currentWorkflow,
    isRunning,
    error,
    startWorkflow,
    getHistory
  } = useWorkflowExecution('main');
  
  // Monitor WebSocket connection
  const {
    isConnected,
    reconnectAttempts,
    activeConnections
  } = useWorkflowConnection();

  const handleStartWorkflow = async () => {
    if (!featureRequest.trim()) return;
    
    try {
      await startWorkflow(featureRequest);
      setFeatureRequest('');
    } catch (err) {
      console.error('Failed to start workflow:', err);
    }
  };

  const handleLoadHistory = async () => {
    const history = await getHistory(10);
    console.log('Workflow history:', history);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header with Connection Status */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Digital Twin Dashboard
              </h1>
              <p className="text-gray-600 mt-1">
                Powered by Cloudflare Agents SDK + Code Mode
              </p>
            </div>
            
            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {isConnected ? (
                <>
                  <Wifi className="w-5 h-5" />
                  <span className="font-medium">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5" />
                  <span className="font-medium">
                    Reconnecting... ({reconnectAttempts})
                  </span>
                </>
              )}
            </div>
          </div>
          
          {/* Active Connections */}
          <div className="mt-4 text-sm text-gray-500">
            {activeConnections} active connection{activeConnections !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Start Workflow Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Start New Workflow
          </h2>
          
          <div className="flex gap-4">
            <input
              type="text"
              value={featureRequest}
              onChange={(e) => setFeatureRequest(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleStartWorkflow()}
              placeholder="Describe the feature you want to build..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isRunning || !isConnected}
            />
            <button
              onClick={handleStartWorkflow}
              disabled={isRunning || !isConnected || !featureRequest.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <Activity className="w-5 h-5 animate-spin" />
                  Running...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Start
                </span>
              )}
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Current Workflow Progress */}
        {currentWorkflow && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            {(() => {
              // Import types lazily to avoid module cycles
              type AgentStep = {
                roleId: string;
                status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
                input: string;
                output?: string;
                error?: string;
                startedAt?: string;
                finishedAt?: string;
              };
              type WorkflowRun = {
                id: string;
                featureRequest: string;
                status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
                steps: AgentStep[] | undefined;
                createdAt: string;
                updatedAt: string;
                artifactUrl?: string;
                prNumber?: number;
                branch?: string;
                quality?: { score: number } | undefined;
              };
              const wf = currentWorkflow as unknown as WorkflowRun;
              const totalDurationMs = (wf.steps || []).reduce((acc, s) => {
                if (s.startedAt && s.finishedAt) {
                  const start = new Date(s.startedAt).getTime();
                  const end = new Date(s.finishedAt).getTime();
                  return acc + Math.max(0, end - start);
                }
                return acc;
              }, 0);
              return (
                <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Current Workflow
              </h2>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                wf.status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : wf.status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {wf.status}
              </div>
            </div>
            
            {/* Feature Request */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-1">
                Feature Request
              </h3>
                    <p className="text-gray-900">{wf.featureRequest}</p>
            </div>
            
            {/* Workflow Steps */}
                  {wf.steps && wf.steps.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">
                        Agent Steps ({wf.steps.length})
                </h3>
                      {wf.steps.map((step: AgentStep, index: number) => (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-medium flex items-center justify-center">
                          {index + 1}
                        </div>
                        <span className="font-medium text-gray-900">
                          {step.roleId}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                              {step.startedAt && step.finishedAt
                                ? `${Math.max(0, new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime())}ms`
                                : ''}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 line-clamp-3">
                      {step.output}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Workflow Metrics */}
            <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs text-blue-600 font-medium">
                    Total Duration
                  </div>
                  <div className="text-lg font-semibold text-blue-900">
                          {(totalDurationMs / 1000).toFixed(2)}s
                  </div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-xs text-green-600 font-medium">
                    Steps Completed
                  </div>
                  <div className="text-lg font-semibold text-green-900">
                          {wf.steps?.length || 0}
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-xs text-purple-600 font-medium">
                    Quality Score
                  </div>
                  <div className="text-lg font-semibold text-purple-900">
                          {wf.quality?.score
                            ? `${(wf.quality.score * 100).toFixed(0)}%`
                      : 'N/A'}
                  </div>
                </div>
              </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleLoadHistory}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Load History
          </button>
          
          {currentWorkflow && (
            <button
              onClick={() => {
                console.log('Workflow export:', currentWorkflow);
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Export Workflow
            </button>
          )}
        </div>

        {/* SDK Features Info */}
        <div className="bg-linear-to-r from-blue-50 to-purple-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            ✨ Agents SDK Features Active
          </h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Real-time WebSocket connection with automatic reconnection
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Bidirectional state synchronization (no polling needed)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Built-in SQL database for audit logging
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Code Mode: Agents write TypeScript to orchestrate workflows
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Callable methods via @callable() decorator
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}

export default AgentSDKDashboard;

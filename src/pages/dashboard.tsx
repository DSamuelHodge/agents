import { useState } from 'react';
import { Activity, Users, Zap, CheckCircle, AlertCircle, Clock, Code, FileText, Database, Settings, TestTube, BookOpen, Briefcase, Layers } from 'lucide-react';

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

const WorkflowVisualizer = ({ workflow }) => {
  const getTierColor = (tier) => {
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
          <div key={idx} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-12 h-12 rounded-full ${getTierColor(role?.tier)} flex items-center justify-center text-white`}>
                <Icon size={24} />
              </div>
              {idx < workflow.length - 1 && (
                <div className="w-0.5 h-16 bg-gray-300 my-2"></div>
              )}
            </div>
            <div className="flex-1 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">{role?.name}</h4>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  step.status === 'completed' ? 'bg-green-100 text-green-800' :
                  step.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
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
                  <div className="text-gray-600 whitespace-pre-wrap">
                    {step.output.substring(0, 150)}...
                  </div>
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
  const [workflow, setWorkflow] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [logs, setLogs] = useState([]);

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  };

  const simulateAgentWork = async (roleId, task, context) => {
    const role = roles.find(r => r.id === roleId);
    addLog(`🤖 ${role.name} starting: ${task}`, 'agent');
    
    // Simulate API call to Gemini
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
    
    // Simulate generated output based on role
    const outputs = {
      pm: `# Feature Specification

**User Story:** As a user, I want to ${task.toLowerCase()}, so that I can have a better experience.

**Acceptance Criteria:**
- Feature must load in < 2 seconds
- Must work on mobile and desktop
- Must handle errors gracefully

**Priority:** P1
**Complexity:** Medium`,
      
      architect: `# Technical Architecture

**Components:**
1. Frontend: React SPA
2. Backend: Cloudflare Workers
3. Database: D1 (SQLite)
4. Storage: R2 for assets

**API Endpoints:**
- POST /api/feature - Create
- GET /api/feature/:id - Read
- PUT /api/feature/:id - Update

**Data Flow:** Client → Worker → D1 → Response`,
      
      frontend: `// React Component
function FeatureComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('/api/feature')
      .then(res => res.json())
      .then(setData);
  }, []);
  
  return <div>{data?.content}</div>;
}`,
      
      backend: `// Cloudflare Worker API
export default {
  async fetch(request, env) {
    if (request.method === 'POST') {
      const data = await request.json();
      await env.DB.prepare(
        'INSERT INTO features (content) VALUES (?)'
      ).bind(data.content).run();
      return new Response('Created', { status: 201 });
    }
  }
}`,
      
      database: `-- Feature Table Schema
CREATE TABLE features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_created ON features(created_at);`,
      
      devops: `# wrangler.toml
name = "feature-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "features"
database_id = "xxx"`,
      
      qa: `# Test Plan

**Test Case 1: Happy Path**
- Input: Valid feature data
- Expected: 201 Created, data saved
- Actual: ✅ Pass

**Test Case 2: Invalid Input**
- Input: Empty data
- Expected: 400 Bad Request
- Actual: ✅ Pass`,
      
      tech_writer: `# Feature Documentation

## Overview
This feature allows users to ${task.toLowerCase()}.

## Usage
\`\`\`javascript
const response = await fetch('/api/feature', {
  method: 'POST',
  body: JSON.stringify({ content: 'test' })
});
\`\`\`

## Response
- 201: Successfully created
- 400: Invalid input`,
      
      project_mgr: `# Project Breakdown

**Phase 1:** Requirements (PM) → Architecture (Architect)
**Phase 2:** Development (Frontend + Backend + Database)
**Phase 3:** Testing (QA) → Documentation (Tech Writer)

**Dependencies:** Backend depends on Database schema
**Timeline:** ~2 days for MVP`
    };
    
    const output = outputs[roleId] || `Task completed: ${task}`;
    addLog(`✅ ${role.name} completed task`, 'success');
    
    return output;
  };

  const runWorkflow = async () => {
    if (!featureRequest.trim()) return;
    
    setIsProcessing(true);
    setWorkflow([]);
    setLogs([]);
    setActiveStep(0);
    
    addLog('🚀 Starting Digital Twin workflow...', 'system');
    
    // Define the waterfall workflow
    const workflowSteps = [
      { roleId: 'project_mgr', task: 'Break down feature request and create task sequence' },
      { roleId: 'pm', task: 'Create detailed feature specification' },
      { roleId: 'architect', task: 'Design technical architecture and API contract' },
      { roleId: 'database', task: 'Design database schema' },
      { roleId: 'backend', task: 'Implement API endpoints' },
      { roleId: 'frontend', task: 'Build user interface components' },
      { roleId: 'devops', task: 'Configure deployment pipeline' },
      { roleId: 'qa', task: 'Create and execute test plan' },
      { roleId: 'tech_writer', task: 'Write user and API documentation' }
    ];
    
    let context = { featureRequest };
    
    for (let i = 0; i < workflowSteps.length; i++) {
      const step = workflowSteps[i];
      
      // Add step to workflow
      setWorkflow(prev => [...prev, {
        ...step,
        status: 'in_progress',
        output: null
      }]);
      setActiveStep(i);
      
      // Simulate agent work
      const output = await simulateAgentWork(step.roleId, step.task, context);
      
      // Update context with output
      context[step.roleId] = output;
      
      // Mark step complete
      setWorkflow(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: 'completed', output } : s
      ));
      
      // Brief pause between agents
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    addLog('🎉 Feature development complete!', 'success');
    setIsProcessing(false);
  };

  const exampleRequests = [
    'Build a user authentication system',
    'Create a blog post management feature',
    'Add real-time chat functionality'
  ];

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
              <div className="flex items-center gap-2 text-sm">
                <Users size={16} className="text-gray-400" />
                <span className="text-gray-600">9 Active Agents</span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-1">
                <Zap size={16} className="text-green-500" />
                <span className="text-green-600">Cloudflare + Gemini Free Tier</span>
              </div>
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
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                rows="4"
                placeholder="Describe the feature you want to build..."
                value={featureRequest}
                onChange={(e) => setFeatureRequest(e.target.value)}
                disabled={isProcessing}
              />
              
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500">Quick examples:</p>
                {exampleRequests.map((ex, idx) => (
                  <button
                    key={idx}
                    onClick={() => setFeatureRequest(ex)}
                    disabled={isProcessing}
                    className="w-full text-left text-xs p-2 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 text-gray-700 disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              
              <button
                onClick={runWorkflow}
                disabled={isProcessing || !featureRequest.trim()}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Clock size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Start Development
                  </>
                )}
              </button>
            </div>

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
      </div>
    </div>
  );
}
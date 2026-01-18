-- Agent definitions (supports 100s of agents)
CREATE TABLE agent_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  mcp_tools TEXT NOT NULL, -- JSON array of tool names
  privilege_level TEXT NOT NULL CHECK(privilege_level IN ('read', 'write', 'admin')),
  container_image TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_agent_privilege ON agent_definitions(privilege_level);

-- MCP server registry
CREATE TABLE mcp_servers (
  name TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK(auth_type IN ('oauth', 'api_key')),
  scopes TEXT, -- JSON array
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Workflows (GitHub issue → code → PR)
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'feature-planning', 'bug-triage', 'code-review'
  issue_number INTEGER,
  pr_number INTEGER,
  status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
  agents TEXT NOT NULL, -- JSON array of agent IDs
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_issue ON workflows(issue_number);

-- Workflow steps (agent execution log)
CREATE TABLE workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  tool_calls TEXT, -- JSON array
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  FOREIGN KEY (agent_id) REFERENCES agent_definitions(id)
);

CREATE INDEX idx_steps_workflow ON workflow_steps(workflow_id, step_order);

-- LLM usage tracking (AI Gateway integration)
CREATE TABLE llm_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  cost REAL NOT NULL,
  cached BOOLEAN DEFAULT 0,
  timestamp INTEGER NOT NULL,
  metadata TEXT, -- JSON
  FOREIGN KEY (agent_id) REFERENCES agent_definitions(id)
);

CREATE INDEX idx_llm_usage_agent ON llm_usage(agent_id, timestamp);
CREATE INDEX idx_llm_usage_cost ON llm_usage(timestamp, cost);

-- GitHub webhook events (audit trail)
CREATE TABLE github_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  action TEXT,
  issue_number INTEGER,
  pr_number INTEGER,
  payload TEXT NOT NULL, -- Full JSON payload
  handled BOOLEAN DEFAULT 0,
  workflow_id TEXT,
  received_at INTEGER NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE INDEX idx_events_type ON github_events(event_type, received_at);
CREATE INDEX idx_events_issue ON github_events(issue_number);
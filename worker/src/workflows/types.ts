// Workflow types
export interface WorkflowRequest {
  featureRequest: string;
}

export interface WorkflowEvent<T = WorkflowRequest> {
  payload: T;
  instanceId: string;
}
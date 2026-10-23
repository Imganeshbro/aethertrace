/**
 * AetherTrace - Core Type Definitions
 * Deterministic Causal Hypervisor & Time-Travel Debugger for Autonomous AI Agents
 */

export type TrajectoryNodeType =
  | 'SYSTEM_PROMPT'
  | 'USER_INPUT'
  | 'MODEL_REASONING'
  | 'TOOL_CALL'
  | 'TOOL_OBSERVATION'
  | 'ENVIRONMENT_MUTATION'
  | 'INVARIANT_EVALUATION'
  | 'AGENT_RESPONSE';

export type NodeStatus = 'SUCCESS' | 'WARNING' | 'ERROR' | 'VETOED';

export type CausalRelation =
  | 'INFORMS'     // E.g., Prompt informs reasoning
  | 'INVOKES'     // E.g., Reasoning invokes tool call
  | 'PRODUCES'    // E.g., Tool call produces observation
  | 'MUTATES'     // E.g., Observation triggers environment mutation
  | 'VIOLATES'    // E.g., Action violates invariant
  | 'RESOLVES';   // E.g., Step resolves prior error

export interface TrajectoryNode {
  id: string;
  stepIndex: number;
  timestamp: string;
  type: TrajectoryNodeType;
  title: string;
  content: unknown;
  contentHash: string; // SHA-256 content address
  causalParents: string[]; // IDs of preceding nodes that influenced this step
  status: NodeStatus;
  metadata: {
    model?: string;
    toolName?: string;
    durationMs?: number;
    tokens?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
    costUsd?: number;
    error?: string;
    [key: string]: unknown;
  };
}

export interface CausalEdge {
  id: string;
  source: string;
  target: string;
  relation: CausalRelation;
  weight: number; // 0.0 - 1.0 confidence/strength
  rationale?: string;
}

export interface TrajectoryMetadata {
  traceId: string;
  sessionName: string;
  agentCommand?: string;
  framework?: string;
  startTime: string;
  endTime?: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'VETOED';
  totalNodes: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface InvariantResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: 'WARNING' | 'BLOCKING';
  message: string;
  targetNodeId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface InvariantRule {
  id: string;
  name: string;
  description: string;
  severity: 'WARNING' | 'BLOCKING';
  evaluate: (node: TrajectoryNode, history: TrajectoryNode[]) => Promise<InvariantResult> | InvariantResult;
}

export interface BlameScore {
  nodeId: string;
  stepIndex: number;
  nodeType: TrajectoryNodeType;
  title: string;
  blameScore: number; // 0.0 - 1.0 (normalized causal responsibility)
  entropyShift: number; // Semantic drift from original objective
  centralityScore: number; // Degree / Betweenness centrality in causal DAG
  explanation: string;
  counterfactualRecommendation: string;
}

export interface TraceBundle {
  version: '1.0.0';
  metadata: TrajectoryMetadata;
  nodes: TrajectoryNode[];
  edges: CausalEdge[];
  invariants: InvariantResult[];
  blameReport?: BlameScore[];
  forkOrigin?: {
    parentTraceId: string;
    forkedAtStep: number;
    timestamp: string;
  };
}

export interface ForkExecutionOptions {
  forkAtStep: number;
  overridePayload?: unknown;
  overrideTitle?: string;
  replayMockStrategy: 'ZERO_TOKEN_GHOST' | 'LIVE_MODIFIED';
}

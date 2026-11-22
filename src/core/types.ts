/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Core Type Definitions for Test-Time Compute & Verifiable RLVR
 */

export type StepType =
  | 'HYPOTHESIS'
  | 'DEDUCTION'
  | 'CODE_EXECUTION'
  | 'ASSERTION'
  | 'CONCLUSION';

export type NodeStatus =
  | 'UNVISITED'
  | 'EXPLORING'
  | 'VERIFIED'
  | 'PRUNED'
  | 'TERMINAL';

export interface ExecutionArtifacts {
  code?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  memoryRssMb?: number;
  error?: string;
}

export interface VerificationResult {
  deterministicPassed: boolean;
  syntaxValid: boolean;
  invariantsPassed: boolean;
  prmScore: number;            // Normalized in [-1.0, 1.0]
  aggregatedReward: number;    // Composite backpropagated reward
  failureReason?: string;
  isFatal: boolean;            // If true, triggers immediate branch pruning
}

export interface ThoughtNodeData {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  depth: number;
  type: StepType;
  description: string;
  payload: string;
  visitCount: number;
  totalValue: number;
  meanValue: number;           // Q(s, a) = totalValue / visitCount
  priorConfidence: number;     // P(s, a) prior from model/PRM
  status: NodeStatus;
  verification?: VerificationResult;
  artifacts?: ExecutionArtifacts;
  estimatedTokens: number;
}

export interface SearchConfig {
  maxDepth: number;
  maxRollouts: number;
  explorationConstant: number; // c_puct (typically 1.414)
  oracleWeight: number;        // alpha for deterministic vs PRM (default 0.70)
  pruningThreshold: number;    // Reward threshold below which node is pruned (e.g. -0.2)
  maxTokensBudget: number;     // Hard limit on total tokens to consume
  branchingFactor: number;     // Number of candidate expansions per node (default 3)
}

export interface Trajectory {
  id: string;
  prompt: string;
  nodes: ThoughtNodeData[];
  cumulativeReward: number;
  isTerminal: boolean;
  isVerified: boolean;
  totalTokens: number;
}

export interface GRPOSample {
  prompt: string;
  group: Array<{
    trajectoryId: string;
    thoughtChain: string;
    finalAnswer: string;
    rawReward: number;
    normalizedAdvantage: number;
    verified: boolean;
  }>;
}

export interface DPOPair {
  prompt: string;
  chosen: {
    thoughtChain: string;
    finalAnswer: string;
    reward: number;
  };
  rejected: {
    thoughtChain: string;
    failedStep: string;
    failureReason: string;
    reward: number;
  };
  margin: number;
}

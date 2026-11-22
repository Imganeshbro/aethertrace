/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Thought Node Model with PUCT (Predictor Upper Confidence Bound for Trees)
 */

import type {
  ExecutionArtifacts,
  NodeStatus,
  StepType,
  ThoughtNodeData,
  VerificationResult
} from './types.ts';

export class ThoughtNode {
  id: string;
  parentId: string | null;
  children: ThoughtNode[] = [];
  depth: number;
  type: StepType;
  description: string;
  payload: string;
  visitCount: number = 0;
  totalValue: number = 0;
  meanValue: number = 0;
  priorConfidence: number;
  status: NodeStatus = 'UNVISITED';
  verification?: VerificationResult;
  artifacts?: ExecutionArtifacts;
  estimatedTokens: number;

  constructor(params: {
    id: string;
    parentId?: string | null;
    depth?: number;
    type?: StepType;
    description: string;
    payload?: string;
    priorConfidence?: number;
    estimatedTokens?: number;
  }) {
    this.id = params.id;
    this.parentId = params.parentId ?? null;
    this.depth = params.depth ?? 0;
    this.type = params.type ?? 'HYPOTHESIS';
    this.description = params.description;
    this.payload = params.payload ?? '';
    this.priorConfidence = Math.max(0.01, Math.min(1.0, params.priorConfidence ?? 0.5));
    this.estimatedTokens = params.estimatedTokens ?? Math.max(15, Math.ceil(this.description.length / 4));
  }

  /**
   * Add a child node and link parent pointer
   */
  addChild(child: ThoughtNode): void {
    child.parentId = this.id;
    child.depth = this.depth + 1;
    (child as any)._parentRef = this;
    this.children.push(child);
  }

  /**
   * Backpropagate reward to update visit count and Q-value
   */
  updateReward(reward: number): void {
    this.visitCount += 1;
    this.totalValue += reward;
    this.meanValue = this.totalValue / this.visitCount;
  }

  /**
   * Compute Predictor Upper Confidence Bound for Trees (PUCT)
   * Formula: Q(s, a) + c_puct * P(s, a) * [ sqrt(sum_b N(s, b)) / (1 + N(s, a)) ]
   */
  calculatePUCT(parentVisits: number, cPuct: number = 1.414): number {
    if (this.status === 'PRUNED') {
      return -Infinity;
    }

    // Exploitation term: Q-value (or 0 if unvisited)
    const exploitation = this.visitCount > 0 ? this.meanValue : 0.0;

    // Exploration term weighted by model prior confidence
    const exploration =
      cPuct *
      this.priorConfidence *
      (Math.sqrt(Math.max(1, parentVisits)) / (1 + this.visitCount));

    return exploitation + exploration;
  }

  /**
   * Mark node as pruned with a failure reason
   */
  markPruned(reason?: string): void {
    this.status = 'PRUNED';
    if (this.verification) {
      this.verification.isFatal = true;
      if (reason) {
        this.verification.failureReason = reason;
      }
    }
  }

  /**
   * Mark node as verified by dual oracles
   */
  markVerified(): void {
    this.status = 'VERIFIED';
  }

  /**
   * Mark node as a terminal conclusion
   */
  markTerminal(): void {
    this.status = 'TERMINAL';
  }

  /**
   * Check if this node is a leaf (no children)
   */
  isLeaf(): boolean {
    return this.children.length === 0;
  }

  /**
   * Convert to serializable data structure
   */
  toData(): ThoughtNodeData {
    return {
      id: this.id,
      parentId: this.parentId,
      childrenIds: this.children.map((c) => c.id),
      depth: this.depth,
      type: this.type,
      description: this.description,
      payload: this.payload,
      visitCount: this.visitCount,
      totalValue: this.totalValue,
      meanValue: this.meanValue,
      priorConfidence: this.priorConfidence,
      status: this.status,
      verification: this.verification,
      artifacts: this.artifacts,
      estimatedTokens: this.estimatedTokens
    };
  }
}

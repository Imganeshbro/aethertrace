/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Branch Pruner: Zero-Token Pruning & Anomaly Death-Penalty Engine
 */

import type { ThoughtNode } from './thought-node.ts';

export interface PruneDecision {
  shouldPrune: boolean;
  reason?: string;
  isFatal: boolean;
}

export class BranchPruner {
  private threshold: number;
  private tokensSaved: number = 0;
  private prunedNodeCount: number = 0;

  constructor(threshold: number = -0.3) {
    this.threshold = threshold;
  }

  /**
   * Evaluate whether a candidate node should be immediately pruned
   */
  evaluateNode(node: ThoughtNode, ancestorChain: ThoughtNode[]): PruneDecision {
    // 1. Invariant or Syntax fatal failure
    if (node.verification?.isFatal) {
      this.recordPruning(node);
      return {
        shouldPrune: true,
        reason: node.verification.failureReason ?? 'Fatal invariant or execution violation',
        isFatal: true
      };
    }

    // 2. Score threshold check
    if (node.verification && node.verification.aggregatedReward < this.threshold) {
      this.recordPruning(node);
      return {
        shouldPrune: true,
        reason: `Aggregated reward ${node.verification.aggregatedReward} is below threshold ${this.threshold}`,
        isFatal: false
      };
    }

    // 3. Cycle and repetitive thought detection
    const isLooping = this.detectRepetitionCycle(node, ancestorChain);
    if (isLooping) {
      this.recordPruning(node);
      return {
        shouldPrune: true,
        reason: 'Circular reasoning loop detected: thought matches an existing ancestor',
        isFatal: true
      };
    }

    return { shouldPrune: false, isFatal: false };
  }

  /**
   * Detect whether node description repeats an ancestor's thought
   */
  private detectRepetitionCycle(node: ThoughtNode, ancestors: ThoughtNode[]): boolean {
    const normalize = (t: string) =>
      t.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const currentNodeText = normalize(node.description);

    for (const ancestor of ancestors) {
      const ancestorText = normalize(ancestor.description);
      if (currentNodeText === ancestorText && currentNodeText.length > 10) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record pruning event and estimate saved tokens
   */
  private recordPruning(node: ThoughtNode): void {
    this.prunedNodeCount += 1;
    // Estimated tokens saved: depth-based hypothetical subtree tokens (assumes 3 branches of depth 2)
    const hypotheticalSubtreeTokens = node.estimatedTokens * 4;
    this.tokensSaved += hypotheticalSubtreeTokens;
    node.markPruned(node.verification?.failureReason);
  }

  getMetrics(): { prunedNodes: number; tokensSaved: number } {
    return {
      prunedNodes: this.prunedNodeCount,
      tokensSaved: this.tokensSaved
    };
  }

  reset(): void {
    this.tokensSaved = 0;
    this.prunedNodeCount = 0;
  }
}

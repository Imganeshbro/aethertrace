/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * MCTS Engine: PUCT Tree Search, Dynamic Backtracking & Frontier Management
 */

import { ThoughtNode } from './thought-node.ts';
import { BranchPruner } from './branch-pruner.ts';
import { ExecutionSandbox } from '../verifier/execution-sandbox.ts';
import { FormalLogicOracle } from '../verifier/formal-logic-oracle.ts';
import { PRMScorer } from '../verifier/prm-scorer.ts';
import type {
  SearchConfig,
  StepType,
  ThoughtNodeData,
  Trajectory,
  VerificationResult
} from './types.ts';

export interface CandidateStepProposal {
  description: string;
  type: StepType;
  payload?: string;
  priorConfidence: number;
  assertionCode?: string;
}

export type CandidateGenerator = (
  prompt: string,
  history: ThoughtNode[]
) => Promise<CandidateStepProposal[]>;

export interface SearchResult {
  bestTrajectory: Trajectory | null;
  rootNode: ThoughtNode;
  allTrajectories: Trajectory[];
  totalRollouts: number;
  totalTokensConsumed: number;
  tokensSavedByPruning: number;
  prunedBranchesCount: number;
  durationMs: number;
  converged: boolean;
  selfConsistencyConsensus?: {
    consensusAnswer: string;
    voteShare: number;
    totalVotes: number;
  };
  entropyUncertaintyScore?: number;
}

export class MCTSEngine {
  config: SearchConfig;
  sandbox: ExecutionSandbox;
  oracle: FormalLogicOracle;
  prmScorer: PRMScorer;
  pruner: BranchPruner;
  private nodeCounter: number = 0;

  constructor(
    config: Partial<SearchConfig> = {},
    components?: {
      sandbox?: ExecutionSandbox;
      oracle?: FormalLogicOracle;
      prmScorer?: PRMScorer;
      pruner?: BranchPruner;
    }
  ) {
    this.config = {
      maxDepth: config.maxDepth ?? 6,
      maxRollouts: config.maxRollouts ?? 30,
      explorationConstant: config.explorationConstant ?? 1.414,
      oracleWeight: config.oracleWeight ?? 0.70,
      pruningThreshold: config.pruningThreshold ?? -0.2,
      maxTokensBudget: config.maxTokensBudget ?? 20000,
      branchingFactor: config.branchingFactor ?? 3
    };

    this.sandbox = components?.sandbox ?? new ExecutionSandbox();
    this.oracle = components?.oracle ?? new FormalLogicOracle();
    this.prmScorer = components?.prmScorer ?? new PRMScorer();
    this.pruner = components?.pruner ?? new BranchPruner(this.config.pruningThreshold);
  }

  /**
   * Run the complete Test-Time MCTS Search
   */
  async search(
    prompt: string,
    generator: CandidateGenerator,
    globalAssertionCode?: string
  ): Promise<SearchResult> {
    const startTime = performance.now();
    this.pruner.reset();

    // 1. Initialize Root Node S0
    const root = new ThoughtNode({
      id: `node_0`,
      depth: 0,
      type: 'HYPOTHESIS',
      description: `Objective: ${prompt}`,
      priorConfidence: 1.0,
      estimatedTokens: 20
    });
    root.status = 'VERIFIED';
    root.visitCount = 1;

    let totalTokens = root.estimatedTokens;
    let rollouts = 0;
    let converged = false;
    let bestTerminalNode: ThoughtNode | null = null;

    // 2. Main Search Loop
    while (rollouts < this.config.maxRollouts && totalTokens < this.config.maxTokensBudget) {
      rollouts++;

      // Selection: traverse down tree using PUCT until an expandable leaf is found
      const selectedLeaf = this.select(root);

      // If depth limit reached, or node is terminal/pruned, backpropagate
      if (selectedLeaf.depth >= this.config.maxDepth || selectedLeaf.status === 'TERMINAL' || selectedLeaf.status === 'PRUNED') {
        this.backpropagate(selectedLeaf, selectedLeaf.meanValue);
        continue;
      }

      // Expansion: generate candidate next steps from current state chain
      const ancestorChain = this.getAncestors(selectedLeaf);
      const candidates = await generator(prompt, ancestorChain);

      if (candidates.length === 0) {
        // Deadlock: no candidates generated
        selectedLeaf.markPruned('Deadlock: No viable next candidates found');
        this.backpropagate(selectedLeaf, -1.0);
        continue;
      }

      // Evaluate and spawn child nodes
      for (const cand of candidates.slice(0, this.config.branchingFactor)) {
        this.nodeCounter++;
        const childNode = new ThoughtNode({
          id: `node_${this.nodeCounter}`,
          parentId: selectedLeaf.id,
          depth: selectedLeaf.depth + 1,
          type: cand.type,
          description: cand.description,
          payload: cand.payload,
          priorConfidence: cand.priorConfidence
        });

        totalTokens += childNode.estimatedTokens;

        // Dual Verification Fabric Evaluation
        const verification = await this.verifyNode(
          childNode,
          prompt,
          ancestorChain,
          cand.assertionCode ?? globalAssertionCode
        );
        childNode.verification = verification;

        // Pruning Decision
        const pruneDecision = this.pruner.evaluateNode(childNode, ancestorChain);

        if (pruneDecision.shouldPrune) {
          childNode.markPruned(pruneDecision.reason);
          selectedLeaf.addChild(childNode);
          this.backpropagate(childNode, -1.0);
        } else {
          childNode.status = cand.type === 'CONCLUSION' ? 'TERMINAL' : 'VERIFIED';
          selectedLeaf.addChild(childNode);
          this.backpropagate(childNode, verification.aggregatedReward);

          if (childNode.status === 'TERMINAL' && verification.aggregatedReward > 0.6) {
            bestTerminalNode = childNode;
            converged = true;
            break;
          }
        }
      }

      if (converged) {
        break;
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    const pruningMetrics = this.pruner.getMetrics();
    const allTrajectories = this.extractAllTrajectories(root, prompt);
    const bestTrajectory = bestTerminalNode
      ? this.buildTrajectory(bestTerminalNode, prompt)
      : this.findHighestRewardTrajectory(allTrajectories);

    const selfConsistencyConsensus = this.computeSelfConsistency(allTrajectories);
    const entropyUncertaintyScore = this.computeSearchEntropy(root);

    return {
      bestTrajectory,
      rootNode: root,
      allTrajectories,
      totalRollouts: rollouts,
      totalTokensConsumed: totalTokens,
      tokensSavedByPruning: pruningMetrics.tokensSaved,
      prunedBranchesCount: pruningMetrics.prunedNodes,
      durationMs,
      converged,
      selfConsistencyConsensus,
      entropyUncertaintyScore
    };
  }

  /**
   * Self-Consistency Majority Voting (SC-CoT): Aggregates terminal conclusions across rollouts
   */
  public computeSelfConsistency(trajectories: Trajectory[]): { consensusAnswer: string; voteShare: number; totalVotes: number } | undefined {
    const terminalTrajs = trajectories.filter((t) => t.isTerminal && t.nodes.length > 0);
    if (terminalTrajs.length === 0) return undefined;

    const voteCounts = new Map<string, number>();
    for (const t of terminalTrajs) {
      const finalNode = t.nodes[t.nodes.length - 1];
      const answer = finalNode.description.trim();
      voteCounts.set(answer, (voteCounts.get(answer) ?? 0) + 1);
    }

    let consensusAnswer = '';
    let maxVotes = 0;
    for (const [ans, votes] of voteCounts.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        consensusAnswer = ans;
      }
    }

    return {
      consensusAnswer,
      voteShare: Number((maxVotes / terminalTrajs.length).toFixed(3)),
      totalVotes: terminalTrajs.length
    };
  }

  /**
   * Shannon Entropy over Root Node child branch visits: H(s) = -sum p(a) log2 p(a)
   */
  public computeSearchEntropy(root: ThoughtNode): number {
    const activeChildren = root.children.filter((c) => c.visitCount > 0);
    if (activeChildren.length <= 1) return 0.0;

    const totalVisits = activeChildren.reduce((sum, c) => sum + c.visitCount, 0);
    if (totalVisits === 0) return 0.0;

    let entropy = 0.0;
    for (const child of activeChildren) {
      const p = child.visitCount / totalVisits;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return Number(entropy.toFixed(3));
  }

  /**
   * Selection step: Pick child node maximizing PUCT
   */
  private select(node: ThoughtNode): ThoughtNode {
    let current = node;

    while (!current.isLeaf()) {
      const activeChildren = current.children.filter((c) => c.status !== 'PRUNED');
      if (activeChildren.length === 0) {
        // All children pruned -> current node becomes a dead end
        current.markPruned('All child branches exhausted or pruned');
        return current;
      }

      // Pick child with highest PUCT score
      let bestChild = activeChildren[0];
      let bestPUCT = -Infinity;

      for (const child of activeChildren) {
        const puct = child.calculatePUCT(current.visitCount, this.config.explorationConstant);
        if (puct > bestPUCT) {
          bestPUCT = puct;
          bestChild = child;
        }
      }

      current = bestChild;
    }

    return current;
  }

  /**
   * Dual Verification: Runs Deterministic Oracles & PRM Step Scorer
   */
  private async verifyNode(
    node: ThoughtNode,
    prompt: string,
    ancestors: ThoughtNode[],
    assertionCode?: string
  ): Promise<VerificationResult> {
    let deterministicPassed = true;
    let syntaxValid = true;
    let invariantsPassed = true;
    let failureReason: string | undefined;
    let isFatal = false;

    // 1. Code AST & Execution Sandbox check if node includes code payload
    if (node.payload && node.payload.trim().length > 0) {
      const syntaxCheck = this.oracle.validateSyntax(node.payload);
      if (!syntaxCheck.valid) {
        syntaxValid = false;
        deterministicPassed = false;
        isFatal = true;
        failureReason = syntaxCheck.error;
      } else if (assertionCode) {
        const runRes = await this.sandbox.runAssertions(node.payload, assertionCode);
        node.artifacts = runRes.artifacts;
        if (!runRes.passed) {
          deterministicPassed = false;
          failureReason = runRes.error ?? 'Deterministic assertions failed';
          // If code threw runtime error or timed out, mark fatal
          if (runRes.artifacts.exitCode !== 0) {
            isFatal = true;
          }
        }
      }
    }

    // 2. PRM Step Evaluation
    const prmResult = await this.prmScorer.scoreStep({
      prompt,
      previousThoughts: ancestors.map((a) => a.description),
      currentThought: node.description,
      stepType: node.type
    });

    // 3. Compute Composite Reward
    const aggregatedReward = this.prmScorer.computeCompositeReward(
      deterministicPassed,
      prmResult.score,
      this.config.oracleWeight,
      isFatal
    );

    return {
      deterministicPassed,
      syntaxValid,
      invariantsPassed,
      prmScore: prmResult.score,
      aggregatedReward,
      failureReason,
      isFatal
    };
  }

  /**
   * Backpropagate reward up to the root
   */
  private backpropagate(leaf: ThoughtNode, reward: number): void {
    let curr: ThoughtNode | null = leaf;
    while (curr !== null) {
      curr.updateReward(reward);
      curr = curr.parentId ? this.findParent(curr) : null;
    }
  }

  private findParent(node: ThoughtNode): ThoughtNode | null {
    // In our tree, parent pointers are IDs; this is traversed during backpropagation
    // In-memory reference is preserved through ancestor lookup
    return (node as any)._parentRef ?? null;
  }

  private getAncestors(node: ThoughtNode): ThoughtNode[] {
    const ancestors: ThoughtNode[] = [];
    let curr: ThoughtNode | null = node;
    while (curr !== null) {
      ancestors.unshift(curr);
      curr = (curr as any)._parentRef ?? null;
    }
    return ancestors;
  }

  private buildTrajectory(terminalNode: ThoughtNode, prompt: string): Trajectory {
    const nodes = this.getAncestors(terminalNode).map((n) => n.toData());
    const cumulativeReward = terminalNode.meanValue;
    const totalTokens = nodes.reduce((sum, n) => sum + n.estimatedTokens, 0);

    return {
      id: `traj_${terminalNode.id}`,
      prompt,
      nodes,
      cumulativeReward,
      isTerminal: terminalNode.status === 'TERMINAL',
      isVerified: terminalNode.verification?.deterministicPassed ?? false,
      totalTokens
    };
  }

  private extractAllTrajectories(root: ThoughtNode, prompt: string): Trajectory[] {
    const trajectories: Trajectory[] = [];

    const traverse = (node: ThoughtNode) => {
      if (node.isLeaf() || node.status === 'TERMINAL' || node.status === 'PRUNED') {
        trajectories.push(this.buildTrajectory(node, prompt));
        return;
      }
      for (const child of node.children) {
        (child as any)._parentRef = node;
        traverse(child);
      }
    };

    traverse(root);
    return trajectories;
  }

  private findHighestRewardTrajectory(trajectories: Trajectory[]): Trajectory | null {
    if (trajectories.length === 0) return null;
    let best = trajectories[0];
    for (const t of trajectories) {
      if (t.cumulativeReward > best.cumulativeReward) {
        best = t;
      }
    }
    return best;
  }
}

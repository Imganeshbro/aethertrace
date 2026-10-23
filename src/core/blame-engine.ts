import type {
  TrajectoryNode,
  BlameScore,
  NodeStatus,
  TrajectoryNodeType
} from '../types/index.ts';
import { CausalGraph } from './causal-graph.ts';

export class CausalBlameEngine {
  private graph: CausalGraph;

  constructor(graph: CausalGraph) {
    this.graph = graph;
  }

  /**
   * Computes an anomaly signal for a single trajectory node.
   * Analyzes payload content, error indicators, schema mismatches, and status.
   */
  private computeAnomalySignal(node: TrajectoryNode): number {
    let score = 0.0;

    // Explicit error or warning statuses
    if (node.status === 'ERROR') score += 0.9;
    if (node.status === 'VETOED') score += 1.0;
    if (node.status === 'WARNING') score += 0.5;

    // Check payload content
    const contentStr = typeof node.content === 'string'
      ? node.content
      : JSON.stringify(node.content || '');

    const lower = contentStr.toLowerCase();

    // Check for common failure and hallucination indicators
    const errorKeywords = [
      'error', 'exception', 'failed', 'failure', '404 not found',
      '500 internal', 'unauthorized', 'syntaxerror', 'nullpointer',
      'undefined', 'cannot read properties', 'invalid parameter',
      'econnrefused', 'timeout'
    ];

    for (const kw of errorKeywords) {
      if (lower.includes(kw)) {
        score += 0.25;
      }
    }

    // Large unformatted payload anomaly (token pollution)
    if (node.type === 'TOOL_OBSERVATION' && contentStr.length > 5000) {
      score += 0.3; // High risk of context pollution
    }

    // Repetitive content (hallucination loop symptom)
    if (node.type === 'MODEL_REASONING' && /(.)\1{10,}/.test(contentStr)) {
      score += 0.6;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculates semantic entropy shift (drift) relative to trajectory goals.
   */
  private computeEntropyShift(node: TrajectoryNode, totalSteps: number): number {
    // Temporal factor: earlier anomalies that cascade are more causally culpable than late symptoms
    const temporalDecay = 1 - (node.stepIndex / Math.max(totalSteps, 1)) * 0.4;
    const anomaly = this.computeAnomalySignal(node);
    return Number((anomaly * temporalDecay).toFixed(4));
  }

  /**
   * Generates natural language counterfactual diagnosis for why this node is blamed.
   */
  private generateExplanation(
    node: TrajectoryNode,
    failureNode: TrajectoryNode,
    blameScore: number
  ): { explanation: string; recommendation: string } {
    if (node.id === failureNode.id) {
      return {
        explanation: `Terminal failure manifested directly at Step ${node.stepIndex} (${node.title}).`,
        recommendation: `Inspect tool parameters or boundary conditions for '${node.title}'.`
      };
    }

    if (node.type === 'TOOL_OBSERVATION') {
      return {
        explanation: `Step ${node.stepIndex} (${node.title}) returned an anomalous or unparsed payload that causally propagated into ${failureNode.title} at Step ${failureNode.stepIndex}.`,
        recommendation: `Sanitize or validate return schema of tool '${node.metadata.toolName || node.title}' before passing to model context.`
      };
    }

    if (node.type === 'MODEL_REASONING') {
      return {
        explanation: `Step ${node.stepIndex} adopted a flawed chain-of-thought premise or hallucinated arguments that led directly to downstream failure at Step ${failureNode.stepIndex}.`,
        recommendation: `Inject counterfactual system guidance or prompt constraint prior to Step ${node.stepIndex}.`
      };
    }

    if (node.type === 'TOOL_CALL') {
      return {
        explanation: `Step ${node.stepIndex} invoked '${node.metadata.toolName || node.title}' with malformed or unverified arguments.`,
        recommendation: `Audit parameter validation rules for tool '${node.metadata.toolName || node.title}'.`
      };
    }

    return {
      explanation: `Step ${node.stepIndex} causally influenced downstream failure with attribution weight ${(blameScore * 100).toFixed(1)}%.`,
      recommendation: `Review state transition at Step ${node.stepIndex}.`
    };
  }

  /**
   * Performs full Causal Blame Localization across the entire trajectory.
   * Identifies the terminal failure node and traces upstream blame back through the DAG.
   */
  public attributeBlame(targetFailureNodeId?: string): BlameScore[] {
    const allNodes = this.graph.getAllNodes();
    if (allNodes.length === 0) return [];

    // Find the primary failure node if not explicitly specified
    let failureNode: TrajectoryNode | undefined;
    if (targetFailureNodeId) {
      failureNode = this.graph.getNode(targetFailureNodeId);
    } else {
      // Find the last node with ERROR or VETOED status, or the last node if failed
      for (let i = allNodes.length - 1; i >= 0; i--) {
        if (allNodes[i].status === 'ERROR' || allNodes[i].status === 'VETOED') {
          failureNode = allNodes[i];
          break;
        }
      }
      if (!failureNode) {
        for (let i = allNodes.length - 1; i >= 0; i--) {
          if (allNodes[i].status === 'WARNING' || this.computeAnomalySignal(allNodes[i]) > 0.4) {
            failureNode = allNodes[i];
            break;
          }
        }
      }
    }

    // If there is no failure node, the trajectory succeeded
    if (!failureNode) {
      return [];
    }

    // Extract all causal ancestors of the failure node
    const ancestors = this.graph.getAncestors(failureNode.id);
    const candidateNodes = [...ancestors, failureNode];
    const centralities = this.graph.computeDegreeCentralities();
    const totalSteps = allNodes.length;

    const scores: BlameScore[] = [];

    for (const node of candidateNodes) {
      const centrality = centralities.get(node.id) || 0.1;
      const entropyShift = this.computeEntropyShift(node, totalSteps);
      const anomalySignal = this.computeAnomalySignal(node);

      // Distance in steps from failure
      const stepDistance = failureNode.stepIndex - node.stepIndex;
      const proximityWeight = 1.0 / (1.0 + Math.log1p(Math.max(0, stepDistance)));

      // Causal blame formula:
      // Combines anomaly severity, graph centrality, and causal propagation
      let rawBlame = (anomalySignal * 0.5) + (centrality * 0.3) + (proximityWeight * 0.2);

      // Boost blame if this is an anomalous tool observation upstream from failure
      if (node.type === 'TOOL_OBSERVATION' && anomalySignal > 0.3) {
        rawBlame *= 1.4;
      }

      // Boost blame if this is the failure node itself
      if (node.id === failureNode.id) {
        rawBlame = Math.max(rawBlame, 0.7);
      }

      const normalizedBlame = Number(Math.min(1.0, Math.max(0.0, rawBlame)).toFixed(4));
      const { explanation, recommendation } = this.generateExplanation(node, failureNode, normalizedBlame);

      scores.push({
        nodeId: node.id,
        stepIndex: node.stepIndex,
        nodeType: node.type,
        title: node.title,
        blameScore: normalizedBlame,
        entropyShift,
        centralityScore: Number(centrality.toFixed(4)),
        explanation,
        counterfactualRecommendation: recommendation
      });
    }

    // Sort in descending order of causal blame score
    return scores.sort((a, b) => b.blameScore - a.blameScore);
  }
}

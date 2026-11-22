/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Trajectory Recorder: Search Graph Path Mining & Anomaly Attribution
 */

import type { Trajectory, ThoughtNodeData } from '../core/types.ts';
import type { SearchResult } from '../core/mcts-engine.ts';

export interface RecordedDatasetTraces {
  prompt: string;
  verifiedTrajectory: Trajectory | null;
  prunedTrajectories: Trajectory[];
  unverifiedTrajectories: Trajectory[];
}

export class TrajectoryRecorder {
  /**
   * Mine and categorize all trajectories from an MCTS search result
   */
  recordFromSearchResult(result: SearchResult, prompt: string): RecordedDatasetTraces {
    const all = result.allTrajectories;
    const verifiedTrajectory = result.bestTrajectory?.isVerified
      ? result.bestTrajectory
      : null;

    const prunedTrajectories: Trajectory[] = [];
    const unverifiedTrajectories: Trajectory[] = [];

    for (const traj of all) {
      if (verifiedTrajectory && traj.id === verifiedTrajectory.id) {
        continue;
      }

      const hasPrunedNode = traj.nodes.some((n) => n.status === 'PRUNED');
      if (hasPrunedNode) {
        prunedTrajectories.push(traj);
      } else {
        unverifiedTrajectories.push(traj);
      }
    }

    return {
      prompt,
      verifiedTrajectory,
      prunedTrajectories,
      unverifiedTrajectories
    };
  }

  /**
   * Format a trajectory into a readable Markdown thought chain
   */
  formatThoughtChain(nodes: ThoughtNodeData[]): string {
    return nodes
      .map((n, idx) => {
        let stepHeader = `[Step ${idx + 1}: ${n.type}]`;
        if (n.status === 'PRUNED') {
          stepHeader += ` (PRUNED: ${n.verification?.failureReason ?? 'Invariant Violation'})`;
        }
        let content = `${stepHeader} ${n.description}`;
        if (n.payload) {
          content += `\n\`\`\`javascript\n${n.payload}\n\`\`\``;
        }
        return content;
      })
      .join('\n\n');
  }
}

/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Dataset Exporter: GRPO (Group Relative Policy Optimization) & DPO Alignment Synthesis
 */

import { writeFile } from 'node:fs/promises';
import { TrajectoryRecorder } from './trajectory-recorder.ts';
import type { DPOPair, GRPOSample, Trajectory } from '../core/types.ts';
import type { SearchResult } from '../core/mcts-engine.ts';

export class DatasetExporter {
  private recorder: TrajectoryRecorder;

  constructor() {
    this.recorder = new TrajectoryRecorder();
  }

  /**
   * Export search results to GRPO (Group Relative Policy Optimization) sample
   * Computes normalized advantages across trajectory cohort:
   * A_i = (R_i - mean(R)) / (std(R) + epsilon)
   */
  exportGRPO(searchResult: SearchResult, prompt: string): GRPOSample {
    const trajectories = searchResult.allTrajectories;
    if (trajectories.length === 0) {
      return { prompt, group: [] };
    }

    const rewards = trajectories.map((t) => t.cumulativeReward);
    const mean = rewards.reduce((acc, r) => acc + r, 0) / rewards.length;
    const variance =
      rewards.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) /
      Math.max(1, rewards.length);
    const std = Math.sqrt(variance);
    const epsilon = 1e-6;

    const group = trajectories.map((t) => {
      const normalizedAdvantage = Number(((t.cumulativeReward - mean) / (std + epsilon)).toFixed(4));
      const finalNode = t.nodes[t.nodes.length - 1];

      return {
        trajectoryId: t.id,
        thoughtChain: this.recorder.formatThoughtChain(t.nodes),
        finalAnswer: finalNode ? finalNode.description : '',
        rawReward: Number(t.cumulativeReward.toFixed(3)),
        normalizedAdvantage,
        verified: t.isVerified
      };
    });

    return { prompt, group };
  }

  /**
   * Export search results into DPO pairwise preference pairs
   * <prompt, chosen (verified), rejected (pruned/flawed)>
   */
  exportDPO(searchResult: SearchResult, prompt: string): DPOPair[] {
    const recorded = this.recorder.recordFromSearchResult(searchResult, prompt);
    if (!recorded.verifiedTrajectory) {
      return [];
    }

    const verified = recorded.verifiedTrajectory;
    const chosenThoughtChain = this.recorder.formatThoughtChain(verified.nodes);
    const finalNode = verified.nodes[verified.nodes.length - 1];
    const chosenAnswer = finalNode ? finalNode.description : '';

    const pairs: DPOPair[] = [];
    const negativeCandidates = [
      ...recorded.prunedTrajectories,
      ...recorded.unverifiedTrajectories
    ];

    for (const rejected of negativeCandidates) {
      const margin = Number((verified.cumulativeReward - rejected.cumulativeReward).toFixed(3));
      if (margin <= 0) continue; // Only export strictly positive preference margins

      const failedNode = rejected.nodes.find((n) => n.status === 'PRUNED') || rejected.nodes[rejected.nodes.length - 1];

      pairs.push({
        prompt,
        chosen: {
          thoughtChain: chosenThoughtChain,
          finalAnswer: chosenAnswer,
          reward: Number(verified.cumulativeReward.toFixed(3))
        },
        rejected: {
          thoughtChain: this.recorder.formatThoughtChain(rejected.nodes),
          failedStep: failedNode ? failedNode.description : '',
          failureReason: failedNode?.verification?.failureReason ?? 'Suboptimal reasoning path',
          reward: Number(rejected.cumulativeReward.toFixed(3))
        },
        margin
      });
    }

    return pairs;
  }

  /**
   * Save RLVR samples to JSONL file
   */
  async saveToJSONL(filePath: string, data: GRPOSample[] | DPOPair[]): Promise<void> {
    const lines = data.map((item) => JSON.stringify(item)).join('\n') + '\n';
    await writeFile(filePath, lines, 'utf8');
  }
}

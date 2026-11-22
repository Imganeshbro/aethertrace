import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MCTSEngine } from '../src/core/mcts-engine.ts';
import { ThoughtNode } from '../src/core/thought-node.ts';
import type { Trajectory } from '../src/core/types.ts';

describe('MCTSEngine: Adaptive Compute, Entropy & Self-Consistency', () => {
  const engine = new MCTSEngine();

  test('computes Self-Consistency Majority Voting (SC-CoT) across terminal trajectories', () => {
    const trajectories: Trajectory[] = [
      {
        id: 't1',
        prompt: 'Solve x + 2 = 5',
        nodes: [{ id: 'n1', description: 'x = 3' } as any],
        cumulativeReward: 1.0,
        isTerminal: true,
        isVerified: true,
        totalTokens: 10
      },
      {
        id: 't2',
        prompt: 'Solve x + 2 = 5',
        nodes: [{ id: 'n2', description: 'x = 3' } as any],
        cumulativeReward: 0.9,
        isTerminal: true,
        isVerified: true,
        totalTokens: 10
      },
      {
        id: 't3',
        prompt: 'Solve x + 2 = 5',
        nodes: [{ id: 'n3', description: 'x = 4' } as any],
        cumulativeReward: 0.2,
        isTerminal: true,
        isVerified: false,
        totalTokens: 10
      }
    ];

    const consensus = engine.computeSelfConsistency(trajectories);
    assert.ok(consensus !== undefined);
    assert.strictEqual(consensus.consensusAnswer, 'x = 3');
    assert.strictEqual(consensus.totalVotes, 3);
    assert.strictEqual(consensus.voteShare, 0.667);
  });

  test('computes Shannon Entropy H(s) over MCTS root branch visits', () => {
    const root = new ThoughtNode({ id: 'root', description: 'Root' });
    const c1 = new ThoughtNode({ id: 'c1', description: 'Branch 1' });
    const c2 = new ThoughtNode({ id: 'c2', description: 'Branch 2' });

    // Equal visits -> Maximum entropy H = 1.0 bit
    c1.visitCount = 10;
    c2.visitCount = 10;
    root.addChild(c1);
    root.addChild(c2);

    const entropyMax = engine.computeSearchEntropy(root);
    assert.strictEqual(entropyMax, 1.0);

    // Skewed visits -> Low entropy
    c1.visitCount = 99;
    c2.visitCount = 1;
    const entropySkewed = engine.computeSearchEntropy(root);
    assert.ok(entropySkewed < 0.2, `Expected low entropy, got ${entropySkewed}`);
  });
});

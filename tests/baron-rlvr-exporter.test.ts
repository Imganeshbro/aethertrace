import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DatasetExporter } from '../src/rlvr/dataset-exporter.ts';
import type { SearchResult } from '../src/core/mcts-engine.ts';
import { ThoughtNode } from '../src/core/thought-node.ts';

describe('DatasetExporter: GRPO & DPO Synthesis', () => {
  const exporter = new DatasetExporter();

  const mockRoot = new ThoughtNode({ id: 'root', description: 'Problem S0' });
  const mockChildVerified = new ThoughtNode({ id: 'c1', description: 'Correct step' });
  mockChildVerified.meanValue = 0.9;
  mockChildVerified.status = 'TERMINAL';
  mockChildVerified.verification = {
    deterministicPassed: true,
    syntaxValid: true,
    invariantsPassed: true,
    prmScore: 0.85,
    aggregatedReward: 0.9,
    isFatal: false
  };

  const mockChildPruned = new ThoughtNode({ id: 'c2', description: 'Flawed step' });
  mockChildPruned.meanValue = -0.8;
  mockChildPruned.status = 'PRUNED';
  mockChildPruned.verification = {
    deterministicPassed: false,
    syntaxValid: false,
    invariantsPassed: false,
    prmScore: -0.7,
    aggregatedReward: -0.8,
    isFatal: true,
    failureReason: 'Syntax Error'
  };

  mockRoot.addChild(mockChildVerified);
  mockRoot.addChild(mockChildPruned);

  const mockSearchResult: SearchResult = {
    bestTrajectory: {
      id: 'traj_c1',
      prompt: 'Test prompt',
      nodes: [mockRoot.toData(), mockChildVerified.toData()],
      cumulativeReward: 0.9,
      isTerminal: true,
      isVerified: true,
      totalTokens: 50
    },
    rootNode: mockRoot,
    allTrajectories: [
      {
        id: 'traj_c1',
        prompt: 'Test prompt',
        nodes: [mockRoot.toData(), mockChildVerified.toData()],
        cumulativeReward: 0.9,
        isTerminal: true,
        isVerified: true,
        totalTokens: 50
      },
      {
        id: 'traj_c2',
        prompt: 'Test prompt',
        nodes: [mockRoot.toData(), mockChildPruned.toData()],
        cumulativeReward: -0.8,
        isTerminal: false,
        isVerified: false,
        totalTokens: 40
      }
    ],
    totalRollouts: 2,
    totalTokensConsumed: 90,
    tokensSavedByPruning: 150,
    prunedBranchesCount: 1,
    durationMs: 40,
    converged: true
  };

  test('exports GRPO cohort with normalized advantage scores', () => {
    const grpo = exporter.exportGRPO(mockSearchResult, 'Test prompt');
    assert.strictEqual(grpo.prompt, 'Test prompt');
    assert.strictEqual(grpo.group.length, 2);

    // The verified trajectory should have higher advantage than the pruned one
    const advantageWinner = grpo.group.find((g) => g.trajectoryId === 'traj_c1')?.normalizedAdvantage ?? 0;
    const advantageLoser = grpo.group.find((g) => g.trajectoryId === 'traj_c2')?.normalizedAdvantage ?? 0;

    assert.ok(advantageWinner > advantageLoser, 'Winner should have strictly greater advantage');
    assert.ok(advantageWinner > 0);
    assert.ok(advantageLoser < 0);
  });

  test('exports DPO preference pairs with positive margin', () => {
    const dpo = exporter.exportDPO(mockSearchResult, 'Test prompt');
    assert.strictEqual(dpo.length, 1);
    assert.ok(dpo[0].margin > 0);
    assert.ok(dpo[0].chosen.thoughtChain.includes('Correct step'));
    assert.ok(dpo[0].rejected.thoughtChain.includes('Flawed step'));
    assert.strictEqual(dpo[0].rejected.failureReason, 'Syntax Error');
  });
});

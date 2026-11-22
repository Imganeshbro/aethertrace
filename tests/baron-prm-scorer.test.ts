import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PRMScorer } from '../src/verifier/prm-scorer.ts';

describe('PRMScorer: Step-Level Process Reward Grading', () => {
  const prm = new PRMScorer();

  test('scores high quality logical deduction positively', async () => {
    const res = await prm.scoreStep({
      prompt: 'Synthesize optimal binary search tree balance algorithm',
      previousThoughts: ['Decompose the tree rotation operations into Left-Rotate and Right-Rotate.'],
      currentThought: 'Verify balance factor is within [-1, 1] following rotation to maintain AVL invariant.',
      stepType: 'DEDUCTION'
    });

    assert.ok(res.score > 0, `Expected score > 0, got ${res.score}`);
    assert.ok(res.goalAlignment > 0.5);
    assert.ok(res.logicalContinuity > 0.5);
  });

  test('penalizes tautological repetition with low logical continuity', async () => {
    const thought = 'We need to sort the array.';
    const res = await prm.scoreStep({
      prompt: 'Sort array of numbers',
      previousThoughts: [thought],
      currentThought: thought, // Exact duplicate
      stepType: 'HYPOTHESIS'
    });

    assert.ok(res.logicalContinuity <= 0.2);
    assert.ok(res.score < 0);
  });

  test('computes composite reward honoring oracle priority', () => {
    // When deterministic passes and PRM is positive
    const rGood = prm.computeCompositeReward(true, 0.8, 0.7);
    assert.ok(rGood > 0.7);

    // When deterministic fails
    const rBad = prm.computeCompositeReward(false, 0.5, 0.7);
    assert.ok(rBad < 0);

    // When fatal error occurs
    const rFatal = prm.computeCompositeReward(false, 0.0, 0.7, true);
    assert.strictEqual(rFatal, -Infinity);
  });
});

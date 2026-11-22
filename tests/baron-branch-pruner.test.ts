import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BranchPruner } from '../src/core/branch-pruner.ts';
import { ThoughtNode } from '../src/core/thought-node.ts';

describe('BranchPruner: Zero-Token Pruning & Deadlock Death-Penalty', () => {
  test('prunes nodes with fatal verification failure', () => {
    const pruner = new BranchPruner(-0.2);
    const node = new ThoughtNode({
      id: 'node_fail',
      description: 'Fatal invalid memory access'
    });
    node.verification = {
      deterministicPassed: false,
      syntaxValid: false,
      invariantsPassed: false,
      prmScore: -0.8,
      aggregatedReward: -Infinity,
      isFatal: true,
      failureReason: 'Syntax error detected'
    };

    const decision = pruner.evaluateNode(node, []);
    assert.strictEqual(decision.shouldPrune, true);
    assert.strictEqual(decision.isFatal, true);
    assert.strictEqual(node.status, 'PRUNED');
    assert.ok(pruner.getMetrics().tokensSaved > 0);
  });

  test('prunes nodes with reward below score threshold', () => {
    const pruner = new BranchPruner(-0.2);
    const node = new ThoughtNode({
      id: 'node_low',
      description: 'Suboptimal path'
    });
    node.verification = {
      deterministicPassed: false,
      syntaxValid: true,
      invariantsPassed: true,
      prmScore: -0.5,
      aggregatedReward: -0.6,
      isFatal: false
    };

    const decision = pruner.evaluateNode(node, []);
    assert.strictEqual(decision.shouldPrune, true);
    assert.strictEqual(node.status, 'PRUNED');
  });

  test('catches circular reasoning loops across ancestor chain', () => {
    const pruner = new BranchPruner();
    const ancestor = new ThoughtNode({
      id: 'node_a',
      description: 'Let us attempt to solve with recursive divide and conquer.'
    });

    const currentNode = new ThoughtNode({
      id: 'node_b',
      description: 'Let us attempt to solve with recursive divide and conquer.' // Exact loop
    });

    const decision = pruner.evaluateNode(currentNode, [ancestor]);
    assert.strictEqual(decision.shouldPrune, true);
    assert.strictEqual(decision.isFatal, true);
    assert.ok(decision.reason?.includes('Circular reasoning loop'));
  });
});

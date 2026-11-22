import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ThoughtNode } from '../src/core/thought-node.ts';

describe('ThoughtNode: Data Model & PUCT Calculations', () => {
  test('initializes with default values and proper priors', () => {
    const node = new ThoughtNode({
      id: 'node_1',
      description: 'Hypothesize dynamic programming state'
    });

    assert.strictEqual(node.id, 'node_1');
    assert.strictEqual(node.status, 'UNVISITED');
    assert.strictEqual(node.visitCount, 0);
    assert.strictEqual(node.meanValue, 0);
    assert.strictEqual(node.priorConfidence, 0.5);
    assert.ok(node.estimatedTokens > 0);
  });

  test('calculates PUCT score balancing exploration and exploitation', () => {
    const root = new ThoughtNode({
      id: 'root',
      description: 'Root problem state'
    });
    root.visitCount = 10;

    const childA = new ThoughtNode({
      id: 'child_a',
      description: 'Step A',
      priorConfidence: 0.9
    });
    root.addChild(childA);

    // Initial unvisited PUCT
    const puctUnvisited = childA.calculatePUCT(root.visitCount, 1.414);
    assert.ok(puctUnvisited > 0, 'Unvisited node should have positive PUCT score');

    // Update with positive reward
    childA.updateReward(1.0);
    assert.strictEqual(childA.visitCount, 1);
    assert.strictEqual(childA.meanValue, 1.0);

    const puctVisited = childA.calculatePUCT(root.visitCount, 1.414);
    // PUCT should reflect exploitation (1.0) + exploration
    assert.ok(puctVisited > 1.0);
  });

  test('pruned nodes return -Infinity PUCT score', () => {
    const node = new ThoughtNode({
      id: 'node_bad',
      description: 'Flawed logic'
    });
    node.markPruned('Fatal error');

    assert.strictEqual(node.status, 'PRUNED');
    const puct = node.calculatePUCT(10);
    assert.strictEqual(puct, -Infinity);
  });
});

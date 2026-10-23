import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CausalGraph } from '../src/core/causal-graph.ts';
import type { TrajectoryNode } from '../src/types/index.ts';

function createDummyNode(
  id: string,
  stepIndex: number,
  type: TrajectoryNode['type'],
  title: string,
  causalParents: string[] = []
): TrajectoryNode {
  return {
    id,
    stepIndex,
    timestamp: new Date().toISOString(),
    type,
    title,
    content: { dummy: true },
    contentHash: 'hash_' + id,
    causalParents,
    status: 'SUCCESS',
    metadata: {}
  };
}

describe('CausalGraph Engine', () => {
  test('correctly links causal dependencies and sorts topologically', () => {
    const graph = new CausalGraph();

    const n0 = createDummyNode('node_0', 0, 'SYSTEM_PROMPT', 'System instructions');
    const n1 = createDummyNode('node_1', 1, 'USER_INPUT', 'Fix bug in auth', ['node_0']);
    const n2 = createDummyNode('node_2', 2, 'MODEL_REASONING', 'Analyzing stack trace', ['node_1']);
    const n3 = createDummyNode('node_3', 3, 'TOOL_CALL', 'Read auth.ts', ['node_2']);
    const n4 = createDummyNode('node_4', 4, 'TOOL_OBSERVATION', 'File contents of auth.ts', ['node_3']);

    graph.addNode(n0);
    graph.addNode(n1);
    graph.addNode(n2);
    graph.addNode(n3);
    graph.addNode(n4);

    const sorted = graph.topologicalSort();
    assert.strictEqual(sorted.length, 5);
    assert.strictEqual(sorted[0].id, 'node_0');
    assert.strictEqual(sorted[4].id, 'node_4');
    assert.strictEqual(graph.detectCycles(), false);
  });

  test('correctly identifies ancestor causal chain', () => {
    const graph = new CausalGraph();
    const n0 = createDummyNode('n0', 0, 'USER_INPUT', 'Start');
    const n1 = createDummyNode('n1', 1, 'MODEL_REASONING', 'Reason', ['n0']);
    const n2 = createDummyNode('n2', 2, 'TOOL_CALL', 'Exec', ['n1']);
    const n3 = createDummyNode('n3', 3, 'TOOL_OBSERVATION', 'Error 500', ['n2']);

    graph.addNode(n0);
    graph.addNode(n1);
    graph.addNode(n2);
    graph.addNode(n3);

    const ancestors = graph.getAncestors('n3');
    assert.strictEqual(ancestors.length, 3);
    assert.deepStrictEqual(ancestors.map(a => a.id), ['n0', 'n1', 'n2']);
  });

  test('detects cycles when circular dependencies are introduced', () => {
    const graph = new CausalGraph();
    const n0 = createDummyNode('n0', 0, 'MODEL_REASONING', 'Step A');
    const n1 = createDummyNode('n1', 1, 'TOOL_CALL', 'Step B', ['n0']);
    graph.addNode(n0);
    graph.addNode(n1);

    // Artificially link n1 -> n0 to create cycle
    graph.addCausalLink('n1', 'n0', 'INFORMS');
    assert.strictEqual(graph.detectCycles(), true);
  });

  test('exports valid Mermaid diagram', () => {
    const graph = new CausalGraph();
    const n0 = createDummyNode('n0', 0, 'USER_INPUT', 'Run diagnostic');
    const n1 = createDummyNode('n1', 1, 'TOOL_CALL', 'probe', ['n0']);
    graph.addNode(n0);
    graph.addNode(n1);

    const mermaid = graph.toMermaid();
    assert.ok(mermaid.startsWith('flowchart TD'));
    assert.ok(mermaid.includes('TOOL: probe'));
  });
});

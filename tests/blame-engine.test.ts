import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CausalGraph } from '../src/core/causal-graph.ts';
import { CausalBlameEngine } from '../src/core/blame-engine.ts';
import type { TrajectoryNode } from '../src/types/index.ts';

function createNode(
  id: string,
  stepIndex: number,
  type: TrajectoryNode['type'],
  title: string,
  content: unknown,
  status: TrajectoryNode['status'] = 'SUCCESS',
  causalParents: string[] = []
): TrajectoryNode {
  return {
    id,
    stepIndex,
    timestamp: new Date().toISOString(),
    type,
    title,
    content,
    contentHash: 'hash_' + id,
    causalParents,
    status,
    metadata: { toolName: title }
  };
}

describe('CausalBlameEngine', () => {
  test('correctly pinpoints upstream corrupted tool output as primary causal blame', () => {
    const graph = new CausalGraph();

    // Step 0: User gives prompt
    const s0 = createNode('s0', 0, 'USER_INPUT', 'Update user email in db', { prompt: '...' });
    // Step 1: Model reasons to fetch user
    const s1 = createNode('s1', 1, 'MODEL_REASONING', 'Fetch existing user record', { plan: 'query' }, 'SUCCESS', ['s0']);
    // Step 2: Tool call to query API
    const s2 = createNode('s2', 2, 'TOOL_CALL', 'getUserById', { id: 'usr_99' }, 'SUCCESS', ['s1']);
    // Step 3: Tool returns 404 Not Found (corrupted/error response that model misinterprets)
    const s3 = createNode('s3', 3, 'TOOL_OBSERVATION', 'getUserById_result', { error: '404 Not Found: User does not exist' }, 'SUCCESS', ['s2']);
    // Step 4: Model misinterprets 404 as empty user and attempts null write
    const s4 = createNode('s4', 4, 'MODEL_REASONING', 'User object retrieved, applying email update', { code: 'user.email = ...' }, 'SUCCESS', ['s3']);
    // Step 5: Write tool fails with NullPointerException crash
    const s5 = createNode('s5', 5, 'ENVIRONMENT_MUTATION', 'updateUserRecord', { error: 'Cannot read properties of undefined (reading email)' }, 'ERROR', ['s4']);

    graph.addNode(s0);
    graph.addNode(s1);
    graph.addNode(s2);
    graph.addNode(s3);
    graph.addNode(s4);
    graph.addNode(s5);

    const blameEngine = new CausalBlameEngine(graph);
    const blameReport = blameEngine.attributeBlame();

    assert.ok(blameReport.length > 0);
    // Either s5 (the failure node) or s3 (the 404 anomaly) should be in the top 2
    const top2Ids = [blameReport[0].nodeId, blameReport[1].nodeId];
    assert.ok(top2Ids.includes('s5'));
    assert.ok(top2Ids.includes('s3'));

    // Step 3 should have an explanation warning about tool observation anomaly
    const s3Score = blameReport.find(b => b.nodeId === 's3');
    assert.ok(s3Score);
    assert.ok(s3Score.blameScore > 0.4);
    assert.ok(s3Score.explanation.includes('anomalous or unparsed payload'));
  });

  test('returns empty report if no failure occurred', () => {
    const graph = new CausalGraph();
    const s0 = createNode('s0', 0, 'USER_INPUT', 'Say hello', {});
    const s1 = createNode('s1', 1, 'AGENT_RESPONSE', 'Hello there!', {});
    graph.addNode(s0);
    graph.addNode(s1);

    const blameEngine = new CausalBlameEngine(graph);
    const report = blameEngine.attributeBlame();
    assert.strictEqual(report.length, 0);
  });

  test('does not penalize user input mentioning error keywords as an anomaly', () => {
    const graph = new CausalGraph();
    const s0 = createNode('s0', 0, 'USER_INPUT', 'Debug authentication failure and 500 error', {});
    const s1 = createNode('s1', 1, 'MODEL_REASONING', 'Reasoning step', {}, 'SUCCESS', ['s0']);
    const s2 = createNode('s2', 2, 'TOOL_CALL', 'query', { error: 'socket closed' }, 'ERROR', ['s1']);

    graph.addNode(s0);
    graph.addNode(s1);
    graph.addNode(s2);

    const blameEngine = new CausalBlameEngine(graph);
    const blameReport = blameEngine.attributeBlame();
    const userPromptScore = blameReport.find(b => b.nodeId === 's0');
    assert.strictEqual(userPromptScore?.entropyShift, 0);
  });
});

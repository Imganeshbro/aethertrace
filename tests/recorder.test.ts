import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FlightRecorder } from '../src/core/recorder.ts';

describe('FlightRecorder', () => {
  test('records sequential nodes with content hashes and generates valid bundle', async () => {
    const recorder = new FlightRecorder('test_session', 'test_cmd');

    const n0 = await recorder.recordStep('USER_INPUT', 'Goal', { goal: 'test' });
    const n1 = await recorder.recordStep('MODEL_REASONING', 'Reason', { thought: 'ok' });
    const n2 = await recorder.recordStep('AGENT_RESPONSE', 'Done', { result: 'passed' });

    assert.strictEqual(recorder.getNodes().length, 3);
    assert.strictEqual(n0.contentHash.length, 64);
    assert.strictEqual(n1.causalParents[0], n0.id);
    assert.strictEqual(n2.causalParents[0], n1.id);

    const bundle = recorder.finalize();
    assert.strictEqual(bundle.metadata.sessionName, 'test_session');
    assert.strictEqual(bundle.metadata.status, 'SUCCESS');
    assert.strictEqual(bundle.nodes.length, 3);
    assert.strictEqual(bundle.edges.length, 2);
  });

  test('saves and reloads .atrace bundle atomically from disk', async () => {
    const recorder = new FlightRecorder('persist_session');
    await recorder.recordStep('USER_INPUT', 'Input', 'hello');
    await recorder.recordStep('AGENT_RESPONSE', 'Output', 'world');

    const tempPath = path.resolve('./traces/test_persist.atrace');
    await recorder.saveToFile(tempPath);

    const { bundle, graph } = await FlightRecorder.loadFromFile(tempPath);
    assert.strictEqual(bundle.metadata.sessionName, 'persist_session');
    assert.strictEqual(graph.getAllNodes().length, 2);

    // Clean up
    await fs.unlink(tempPath).catch(() => {});
  });
});

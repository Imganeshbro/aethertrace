import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FlightRecorder } from '../src/core/recorder.ts';
import { TestSynthesizer } from '../src/synthesizer/test-generator.ts';

describe('TestSynthesizer', () => {
  test('synthesizes valid runnable test code from trace bundle', async () => {
    const recorder = new FlightRecorder('synth_test_session');
    await recorder.recordStep('USER_INPUT', 'Query', 'Find data');
    await recorder.recordStep('TOOL_CALL', 'queryDb', { table: 'users' }, { metadata: { toolName: 'queryDb' } });
    await recorder.recordStep('TOOL_OBSERVATION', 'dbResult', [{ id: 1, name: 'Alice' }]);
    await recorder.recordStep('AGENT_RESPONSE', 'Answer', 'Found 1 user');

    const bundle = recorder.finalize('SUCCESS');
    const synth = new TestSynthesizer(bundle);
    const code = synth.generateTestCode();

    assert.ok(code.includes("import { test, describe } from 'node:test'"));
    assert.ok(code.includes('Agent Regression Test [synth_test_session]'));
    assert.ok(code.includes('queryDb'));
    assert.ok(code.includes('Alice'));
  });
});

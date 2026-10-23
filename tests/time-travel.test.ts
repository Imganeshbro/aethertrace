import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FlightRecorder } from '../src/core/recorder.ts';
import { TimeTravelEngine } from '../src/core/time-travel.ts';

describe('TimeTravelEngine', () => {
  test('scrubs timeline and creates counterfactual fork at specific step', async () => {
    const recorder = new FlightRecorder('orig_session');
    await recorder.recordStep('USER_INPUT', 'Step 0', 'start');
    await recorder.recordStep('MODEL_REASONING', 'Step 1', 'think');
    await recorder.recordStep('TOOL_CALL', 'Step 2', { tool: 'failing_tool' });
    await recorder.recordStep('TOOL_OBSERVATION', 'Step 3', { error: '500 fail' });

    const bundle = recorder.finalize('FAILED');
    const tt = new TimeTravelEngine(bundle);

    const scrubbed = tt.scrubToStep(2);
    assert.strictEqual(scrubbed.length, 3);
    assert.strictEqual(scrubbed[2].title, 'Step 2');

    // Fork at step 2 with fixed tool arguments
    const forkedRecorder = await tt.createFork({
      forkAtStep: 2,
      overridePayload: { tool: 'working_tool' },
      overrideTitle: 'Step 2 [PATCHED]',
      replayMockStrategy: 'ZERO_TOKEN_GHOST'
    });

    await forkedRecorder.recordStep('TOOL_OBSERVATION', 'Step 3 [PATCHED]', { status: 200, success: true });
    await forkedRecorder.recordStep('AGENT_RESPONSE', 'Step 4', 'Done cleanly');

    const forkedBundle = forkedRecorder.finalize('SUCCESS');
    assert.strictEqual(forkedBundle.nodes.length, 5);

    const diff = TimeTravelEngine.compareTrajectories(bundle, forkedBundle, 2);
    assert.strictEqual(diff.forkStep, 2);
    assert.strictEqual(diff.resolvedFailure, true);
  });
});

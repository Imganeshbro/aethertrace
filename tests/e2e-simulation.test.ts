import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FlightRecorder } from '../src/core/recorder.ts';
import { CausalBlameEngine } from '../src/core/blame-engine.ts';
import { TimeTravelEngine } from '../src/core/time-travel.ts';
import { TestSynthesizer } from '../src/synthesizer/test-generator.ts';
import { DashboardGenerator } from '../src/ui/dashboard-generator.ts';

describe('AetherTrace End-to-End Autonomous Hypervisor Suite', () => {
  test('full lifecycle: interception, causal blame, time-travel repair, test synthesis, and dashboard generation', async () => {
    // 1. Intercept agent trajectory with cascading failure
    const recorder = new FlightRecorder('e2e_autonomous_agent', 'agent run');

    await recorder.recordStep('USER_INPUT', 'Task: Refactor auth middleware', { task: 'refactor' });
    await recorder.recordStep('MODEL_REASONING', 'Find middleware files', { plan: 'glob search' });
    await recorder.recordStep('TOOL_CALL', 'list_files', { pattern: 'src/auth/*.ts' }, { metadata: { toolName: 'list_files' } });
    await recorder.recordStep(
      'TOOL_OBSERVATION',
      'list_files_output',
      { error: 'ECONNREFUSED: Language server daemon unavailable' },
      { metadata: { toolName: 'list_files', isError: true } }
    );
    await recorder.recordStep('MODEL_REASONING', 'Retry with forced overwrite', { plan: 'force' });
    await recorder.recordStep(
      'ENVIRONMENT_MUTATION',
      'build_failure',
      { error: 'Cannot compile: missing symbols due to missing files' },
      { status: 'ERROR' }
    );

    const bundle = recorder.finalize('FAILED');
    assert.strictEqual(bundle.metadata.status, 'FAILED');
    assert.strictEqual(bundle.nodes.length, 6);

    // 2. Causal Blame Localization
    const blameEngine = new CausalBlameEngine(recorder.getGraph());
    const blameReport = blameEngine.attributeBlame();
    assert.ok(blameReport.length > 0);

    const topBlame = blameReport[0];
    assert.ok(topBlame.blameScore > 0.5);

    // 3. Time-Travel Counterfactual Branching
    const timeTravel = new TimeTravelEngine(bundle);
    const forkRecorder = await timeTravel.createFork({
      forkAtStep: 3,
      overridePayload: { files: ['src/auth/middleware.ts', 'src/auth/token.ts'] },
      overrideTitle: 'list_files_output [SYNTHETIC CLEAN CACHE]',
      replayMockStrategy: 'ZERO_TOKEN_GHOST'
    });

    await forkRecorder.recordStep('MODEL_REASONING', 'Files discovered, applying clean refactor', {});
    await forkRecorder.recordStep('ENVIRONMENT_MUTATION', 'build_success', { status: 'build passed' });

    const forkedBundle = forkRecorder.finalize('SUCCESS');
    const diff = TimeTravelEngine.compareTrajectories(bundle, forkedBundle, 3);
    assert.strictEqual(diff.resolvedFailure, true);

    // 4. Test Synthesis
    const synth = new TestSynthesizer(bundle);
    const testCode = synth.generateTestCode();
    assert.ok(testCode.length > 100);

    // 5. Dashboard Generation
    const html = DashboardGenerator.generateHtml(forkedBundle);
    assert.ok(html.includes('AetherTrace Studio'));
    assert.ok(html.includes('AGENT HYPERVISOR'));
  });
});

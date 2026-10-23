import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DashboardGenerator } from '../src/ui/dashboard-generator.ts';
import { FlightRecorder } from '../src/core/recorder.ts';

describe('DashboardGenerator', () => {
  test('generates self-contained HTML with embedded trace bundle and scrubber controls', async () => {
    const recorder = new FlightRecorder('web_studio_test');
    await recorder.recordStep('USER_INPUT', 'Analyze codebase', 'Search');
    await recorder.recordStep('TOOL_CALL', 'grep', { pattern: 'auth' }, { metadata: { toolName: 'grep' } });
    await recorder.recordStep('TOOL_OBSERVATION', 'grepResult', { matches: 5 });

    const bundle = recorder.finalize('SUCCESS');
    const html = DashboardGenerator.generateHtml(bundle);

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('AetherTrace Studio - web_studio_test'));
    assert.ok(html.includes('graphCanvas'));
    assert.ok(html.includes('scrubber'));
    assert.ok(html.includes('blameTab'));
    assert.ok(html.includes('invariantsTab'));
    assert.ok(html.includes('grepResult'));
  });
});

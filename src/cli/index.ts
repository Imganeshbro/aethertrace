import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FlightRecorder } from '../core/recorder.ts';
import { CausalGraph } from '../core/causal-graph.ts';
import { CausalBlameEngine } from '../core/blame-engine.ts';
import { AgentFirewall } from '../core/firewall.ts';
import { TimeTravelEngine } from '../core/time-travel.ts';
import { TestSynthesizer } from '../synthesizer/test-generator.ts';
import { DashboardGenerator } from '../ui/dashboard-generator.ts';
import { AetherTraceMcpServer } from '../mcp/server.ts';
import type { TraceBundle } from '../types/index.ts';

function printBanner() {
  console.log(`
  \x1b[36m╔═════════════════════════════════════════════════════════════════╗\x1b[0m
  \x1b[36m║\x1b[0m   \x1b[1m\x1b[34mAGENTREWIND\x1b[0m \x1b[90m— Time-Travel Debugger for AI Agents\x1b[0m            \x1b[36m║\x1b[0m
  \x1b[36m║\x1b[0m   \x1b[32mZero-Token Replay\x1b[0m | \x1b[35mCausal Blame\x1b[0m | \x1b[33mActive Invariants\x1b[0m        \x1b[36m║\x1b[0m
  \x1b[36m╚═════════════════════════════════════════════════════════════════╝\x1b[0m
  `);
}

function printHelp() {
  printBanner();
  console.log(`
  \x1b[1mUSAGE:\x1b[0m
    agent-rewind <command> [options]
    (Aliases: rewind, aethertrace)

  \x1b[1mCOMMANDS:\x1b[0m
    \x1b[32mdemo\x1b[0m                               Run interactive multi-step agent simulation demo
    \x1b[32mblame\x1b[0m <trace.atrace>                Analyze causal root causes of an agent failure
    \x1b[32minspect\x1b[0m <trace.atrace> [--port 4200]  Launch interactive visual web studio & DAG visualizer
    \x1b[32mreplay\x1b[0m <trace.atrace> [--fork-at N]   Rewind and fork execution at specific step
    \x1b[32msynth\x1b[0m <trace.atrace> [--output file]  Synthesize zero-token deterministic CI test suite
    \x1b[32mmcp\x1b[0m                                 Launch Model Context Protocol (MCP) stdio server

  \x1b[1mEXAMPLES:\x1b[0m
    npx agent-rewind demo
    npx agent-rewind blame traces/demo_failure.atrace
    npx agent-rewind inspect traces/demo_failure.atrace
  `);
}

export async function runDemo(): Promise<void> {
  printBanner();
  console.log('\x1b[1m[1/4] Initializing AgentRewind Autonomous Agent Simulation...\x1b[0m');

  const recorder = new FlightRecorder('demo_autonomous_bug_fixer', 'agent fix-auth-flow');

  // Step 0: User prompt
  await recorder.recordStep(
    'USER_INPUT',
    'User Request: Fix auth token refresh',
    { prompt: 'Please investigate token refresh failure in auth service and update config' }
  );
  console.log('  ✔ Step 0: User goal recorded');

  // Step 1: Model CoT
  await recorder.recordStep(
    'MODEL_REASONING',
    'Plan: Read auth service logs',
    { thought: 'I should first read the logs to see the exception stack trace.' }
  );
  console.log('  ✔ Step 1: Model reasoning captured');

  // Step 2: Tool call
  await recorder.recordStep(
    'TOOL_CALL',
    'read_logs',
    { service: 'auth-service', lines: 50 },
    { metadata: { toolName: 'read_logs' } }
  );
  console.log('  ✔ Step 2: Tool call dispatched (read_logs)');

  // Step 3: Tool observation with subtle corruption / 500 error
  await recorder.recordStep(
    'TOOL_OBSERVATION',
    'read_logs_output',
    {
      status: 500,
      rawOutput: '500 Internal Server Error: Remote logging socket timed out while reading /var/log/auth.log'
    },
    { metadata: { toolName: 'read_logs', isError: true } }
  );
  console.log('  \x1b[33m✔ Step 3: Tool observation received (Warning: 500 socket timeout)\x1b[0m');

  // Step 4: Model hallucination / false assumption
  await recorder.recordStep(
    'MODEL_REASONING',
    'Flawed Assumption: File does not exist',
    { thought: 'Since logging timed out, I will assume the auth config file is missing and delete the cache directory.' }
  );
  console.log('  ✔ Step 4: Model formed reasoning path');

  // Step 5: Destructive tool attempt (Firewall intercept!)
  console.log('  \x1b[35m[AETHERTRACE HYPERVISOR] Evaluating step against active safety invariants...\x1b[0m');
  const vetoedStep = await recorder.recordStep(
    'TOOL_CALL',
    'execute_shell',
    { command: 'rm -rf /var/auth/cache' },
    { metadata: { toolName: 'execute_shell' } }
  );

  if (vetoedStep.status === 'VETOED') {
    console.log('  \x1b[31m⛔ VETOED: Invariant [destructive-command-guard] blocked command "rm -rf /var/auth/cache"!\x1b[0m');
  }

  // Step 6: Step crashes
  await recorder.recordStep(
    'ENVIRONMENT_MUTATION',
    'execute_shell_failure',
    { error: 'Operation aborted by Hypervisor security invariant' },
    { causalParents: [vetoedStep.id] }
  );

  const tracePath = path.resolve('./traces/demo_failure.atrace');
  await recorder.saveToFile(tracePath);
  console.log(`\n\x1b[32m✔ Flight trace saved atomically to: ${tracePath}\x1b[0m\n`);

  console.log('\x1b[1m[2/4] Executing Causal Blame Localization Algorithm...\x1b[0m');
  const { bundle, graph } = await FlightRecorder.loadFromFile(tracePath);
  const blameEngine = new CausalBlameEngine(graph);
  const report = blameEngine.attributeBlame();

  console.log('\n  \x1b[1mCAUSAL BLAME ATTRIBUTION REPORT:\x1b[0m');
  console.log('  ' + '─'.repeat(70));
  for (const [idx, b] of report.entries()) {
    const scoreColor = b.blameScore > 0.6 ? '\x1b[31m' : '\x1b[33m';
    console.log(`  \x1b[1m#${idx + 1}\x1b[0m Step ${b.stepIndex} [${b.nodeType}] ${b.title}`);
    console.log(`     Blame Score: ${scoreColor}${(b.blameScore * 100).toFixed(1)}%\x1b[0m | Centrality: ${b.centralityScore}`);
    console.log(`     \x1b[90mExplanation: ${b.explanation}\x1b[0m`);
    console.log(`     \x1b[36m💡 Recommended Remedy: ${b.counterfactualRecommendation}\x1b[0m\n`);
  }

  console.log('\x1b[1m[3/4] Testing Counterfactual Time-Travel Forking...\x1b[0m');
  const timeTravel = new TimeTravelEngine(bundle);
  // Rewind to Step 3 and inject mock clean log
  const forkRecorder = await timeTravel.createFork({
    forkAtStep: 3,
    overrideTitle: 'read_logs_output [COUNTERFACTUAL CLEAN MOCK]',
    overridePayload: { status: 200, logs: '2026-10-23: Token refreshed successfully for user_42' },
    replayMockStrategy: 'ZERO_TOKEN_GHOST'
  });

  // Re-run downstream from fork cleanly
  await forkRecorder.recordStep(
    'MODEL_REASONING',
    'Resolved Reasoning',
    { thought: 'Token refresh is working normally, updating ttl parameter in config.' }
  );
  await forkRecorder.recordStep(
    'AGENT_RESPONSE',
    'Task Completed',
    { result: 'Auth token configuration validated.' }
  );

  const forkedBundle = forkRecorder.finalize('SUCCESS');
  const diff = TimeTravelEngine.compareTrajectories(bundle, forkedBundle, 3);
  console.log(`  ✔ Fork created from Step 3 without repeating Steps 0-2 (0 tokens spent)`);
  console.log(`  ✔ Counterfactual outcome: Failure resolved = \x1b[32m${diff.resolvedFailure}\x1b[0m\n`);

  console.log('\x1b[1m[4/4] Synthesizing Deterministic CI Regression Test...\x1b[0m');
  const synth = new TestSynthesizer(bundle);
  const testCode = synth.generateTestCode();
  const synthPath = path.resolve('./tests/generated_regression.test.ts');
  await fs.writeFile(synthPath, testCode, 'utf-8');
  console.log(`  ✔ Zero-token CI regression test generated at: ${synthPath}`);
  console.log('\n\x1b[1m\x1b[32m✨ DEMO COMPLETED SUCCESSFULLY! Run "aethertrace inspect traces/demo_failure.atrace" to view in browser.\x1b[0m\n');
}

export async function runInspect(traceFilePath: string, port: number = 4200): Promise<void> {
  const resolved = path.resolve(traceFilePath);
  const { bundle } = await FlightRecorder.loadFromFile(resolved);
  const html = DashboardGenerator.generateHtml(bundle);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(port, () => {
    printBanner();
    console.log(`  \x1b[32m✔ AetherTrace Interactive Studio running at:\x1b[0m`);
    console.log(`    \x1b[1m\x1b[36mhttp://localhost:${port}\x1b[0m`);
    console.log(`\n  Inspect session: \x1b[1m${bundle.metadata.sessionName}\x1b[0m (${bundle.nodes.length} steps)`);
    console.log(`  Press Ctrl+C to close server.\n`);
  });
}

export async function runBlame(traceFilePath: string): Promise<void> {
  printBanner();
  const resolved = path.resolve(traceFilePath);
  const { bundle, graph } = await FlightRecorder.loadFromFile(resolved);
  const blameEngine = new CausalBlameEngine(graph);
  const report = blameEngine.attributeBlame();

  console.log(`  Trace: \x1b[1m${bundle.metadata.sessionName}\x1b[0m (${bundle.metadata.traceId})`);
  console.log(`  Status: \x1b[1m${bundle.metadata.status}\x1b[0m | Duration: ${bundle.metadata.durationMs}ms\n`);

  if (report.length === 0) {
    console.log('  \x1b[32m✔ No causal failures or invariant violations detected in this trace.\x1b[0m\n');
    return;
  }

  console.log('  \x1b[1mCAUSAL BLAME RANKING:\x1b[0m');
  console.log('  ' + '─'.repeat(70));
  for (const [idx, b] of report.entries()) {
    const scoreColor = b.blameScore > 0.6 ? '\x1b[31m' : '\x1b[33m';
    console.log(`  \x1b[1m#${idx + 1}\x1b[0m Step ${b.stepIndex}: ${b.title} [${b.nodeType}]`);
    console.log(`     Blame: ${scoreColor}${(b.blameScore * 100).toFixed(1)}%\x1b[0m | Centrality: ${b.centralityScore} | Entropy: ${b.entropyShift}`);
    console.log(`     \x1b[90m${b.explanation}\x1b[0m`);
    console.log(`     \x1b[36m💡 ${b.counterfactualRecommendation}\x1b[0m\n`);
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'demo':
        await runDemo();
        break;
      case 'blame':
        if (!args[1]) {
          console.error('\x1b[31mError: Missing trace file path. Usage: aethertrace blame <file.atrace>\x1b[0m');
          process.exit(1);
        }
        await runBlame(args[1]);
        break;
      case 'inspect':
        if (!args[1]) {
          console.error('\x1b[31mError: Missing trace file path. Usage: aethertrace inspect <file.atrace>\x1b[0m');
          process.exit(1);
        }
        const portArg = args.indexOf('--port');
        const port = portArg !== -1 ? parseInt(args[portArg + 1], 10) : 4200;
        await runInspect(args[1], port);
        break;
      case 'synth':
        if (!args[1]) {
          console.error('\x1b[31mError: Missing trace file path. Usage: aethertrace synth <file.atrace> [--output <file>]\x1b[0m');
          process.exit(1);
        }
        const { bundle } = await FlightRecorder.loadFromFile(args[1]);
        const synth = new TestSynthesizer(bundle);
        const code = synth.generateTestCode();
        const outArg = args.indexOf('--output');
        const outPath = outArg !== -1 ? args[outArg + 1] : './tests/synthetic_regression.test.ts';
        await fs.writeFile(path.resolve(outPath), code, 'utf-8');
        console.log(`\x1b[32m✔ Test generated at: ${outPath}\x1b[0m`);
        break;
      case 'mcp':
        const mcpServer = new AetherTraceMcpServer();
        mcpServer.startStdio();
        break;
      default:
        printHelp();
        break;
    }
  } catch (err) {
    console.error('\x1b[31mFatal error:\x1b[0m', err);
    process.exit(1);
  }
}

// Run main if invoked directly
const isDirectEntry = process.argv[1] && (
  process.argv[1].endsWith('index.ts') ||
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('aethertrace.js')
);

if (isDirectEntry) {
  main();
}

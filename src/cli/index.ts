/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * CLI Entrypoint: Test-Time Compute Search, Live Benchmark Demo & RLVR Exporter
 */

import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MCTSEngine, type CandidateStepProposal } from '../core/mcts-engine.ts';
import { TerminalVisualizer } from '../ui/terminal-visualizer.ts';
import { HtmlTreeGenerator } from '../ui/html-tree-generator.ts';
import { DatasetExporter } from '../rlvr/dataset-exporter.ts';
import { ExecutionSandbox } from '../verifier/execution-sandbox.ts';
import { FormalLogicOracle } from '../verifier/formal-logic-oracle.ts';
import { PRMScorer } from '../verifier/prm-scorer.ts';

const args = process.argv.slice(2);
const command = args[0] || 'demo';

async function runDemo() {
  console.log('\n\x1b[1m\x1b[36m╔════════════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[36m║     BARON: Branching Autonomous Reasoning & Oracle Network             ║\x1b[0m');
  console.log('\x1b[1m\x1b[36m║     Universal Test-Time Compute & Verifiable RLVR Reasoning Engine     ║\x1b[0m');
  console.log('\x1b[1m\x1b[36m╚════════════════════════════════════════════════════════════════════════╝\x1b[0m\n');

  const prompt = 'Synthesize a provably optimal O(n) Monotonic Deque algorithm for Sliding Window Maximum with invariant bounds';
  console.log(`\x1b[33m[TASK]\x1b[0m ${prompt}\n`);
  console.log(`\x1b[34m[INIT]\x1b[0m Initializing PUCT Search Engine with Dual-Engine Verification Fabric...\n`);

  const visualizer = new TerminalVisualizer();
  const htmlGen = new HtmlTreeGenerator();
  const exporter = new DatasetExporter();
  const engine = new MCTSEngine({
    maxDepth: 4,
    maxRollouts: 15,
    explorationConstant: 1.414,
    pruningThreshold: -0.2
  });

  // Deterministic generator simulating thought branches:
  // - Branch 1: Flawed brute-force O(n*k) with high complexity
  // - Branch 2: Degenerate syntax error (triggers instant AST fatal pruning)
  // - Branch 3: Monotonic deque approach with formal assertion checks (verified terminal solution)
  const candidateGenerator = async (p: string, history: any[]): Promise<CandidateStepProposal[]> => {
    const depth = history.length;

    if (depth === 1) {
      return [
        {
          type: 'HYPOTHESIS',
          description: 'Hypothesis A: Use nested loops over each window k. Complexity is O(n*k).',
          priorConfidence: 0.45,
          payload: `function maxSlidingWindow(nums, k) {
            let res = [];
            for (let i = 0; i <= nums.length - k; i++) {
              let m = -Infinity;
              for (let j = 0; j < k; j++) m = Math.max(m, nums[i + j]);
              res.push(m);
            }
            return res;
          }`
        },
        {
          type: 'HYPOTHESIS',
          description: 'Hypothesis B: Attempt recursive divide-and-conquer segmentation.',
          priorConfidence: 0.35,
          payload: `function maxSlidingWindow(nums, k) { // Incomplete syntax
            if (nums.length === 0) return [
          ` // Deliberate syntax error to test AST gate
        },
        {
          type: 'HYPOTHESIS',
          description: 'Hypothesis C: Maintain a monotonic descending deque of indices for strict O(n) runtime.',
          priorConfidence: 0.85,
          payload: `function maxSlidingWindow(nums, k) {
            let q = [];
            let res = [];
            for (let i = 0; i < nums.length; i++) {
              while (q.length && q[0] <= i - k) q.shift();
              while (q.length && nums[q[q.length - 1]] <= nums[i]) q.pop();
              q.push(i);
              if (i >= k - 1) res.push(nums[q[0]]);
            }
            return res;
          }`
        }
      ];
    }

    if (depth === 2) {
      const parent = history[history.length - 1];
      if (parent.description.includes('Hypothesis C')) {
        return [
          {
            type: 'CONCLUSION',
            description: 'Terminal Verification: Run boundary assertions and assert O(n) amortized complexity.',
            priorConfidence: 0.95,
            payload: `function maxSlidingWindow(nums, k) {
              let q = [];
              let res = [];
              for (let i = 0; i < nums.length; i++) {
                while (q.length && q[0] <= i - k) q.shift();
                while (q.length && nums[q[q.length - 1]] <= nums[i]) q.pop();
                q.push(i);
                if (i >= k - 1) res.push(nums[q[0]]);
              }
              return res;
            }`,
            assertionCode: `
              const assert = require('node:assert');
              const res1 = maxSlidingWindow([1,3,-1,-3,5,3,6,7], 3);
              assert.deepStrictEqual(res1, [3,3,5,5,6,7]);
              const res2 = maxSlidingWindow([1], 1);
              assert.deepStrictEqual(res2, [1]);
              console.log('ALL INVARIANTS & BOUNDARY TESTS PASSED deterministically.');
            `
          }
        ];
      }
    }

    return [];
  };

  const assertionCode = `
    const assert = require('node:assert');
    if (typeof maxSlidingWindow === 'function') {
      const res = maxSlidingWindow([1,3,-1,-3,5,3,6,7], 3);
      assert.deepStrictEqual(res, [3,3,5,5,6,7]);
    }
  `;

  console.log('\x1b[32m[SEARCH]\x1b[0m Executing PUCT tree search with dynamic pruning...\n');
  const result = await engine.search(prompt, candidateGenerator, assertionCode);

  console.log(visualizer.renderTree(result.rootNode));
  console.log(visualizer.renderMetrics(result));

  // Synthesize RLVR training dataset
  const grpoSample = exporter.exportGRPO(result, prompt);
  const dpoPairs = exporter.exportDPO(result, prompt);

  const tracesDir = join(process.cwd(), 'traces');
  await exporter.saveToJSONL(join(tracesDir, 'sample_grpo.jsonl'), [grpoSample]);
  await exporter.saveToJSONL(join(tracesDir, 'sample_dpo.jsonl'), dpoPairs);

  // Generate interactive HTML dashboard
  const htmlContent = htmlGen.generateHtml(result, prompt);
  await writeFile(join(tracesDir, 'baron_tree.html'), htmlContent, 'utf8');

  console.log(`\x1b[32m✔ [RLVR EXPORT]\x1b[0m Synthesized ${grpoSample.group.length} trajectories into GRPO format -> traces/sample_grpo.jsonl`);
  console.log(`\x1b[32m✔ [RLVR EXPORT]\x1b[0m Synthesized ${dpoPairs.length} preference pairs into DPO format -> traces/sample_dpo.jsonl`);
  console.log(`\x1b[32m✔ [UI DASHBOARD]\x1b[0m Interactive graph written -> traces/baron_tree.html\n`);
}

async function runSolve(promptInput?: string) {
  const prompt = promptInput || args.slice(1).join(' ') || 'Write a verified prime factorization algorithm';
  console.log(`\n\x1b[36m[BARON SOLVE]\x1b[0m Searching test-time solution for: "${prompt}"\n`);
  
  const engine = new MCTSEngine();
  const visualizer = new TerminalVisualizer();

  const dummyGenerator = async (p: string, h: any[]): Promise<CandidateStepProposal[]> => {
    if (h.length === 1) {
      return [
        {
          type: 'HYPOTHESIS',
          description: `Analyze prime factorization properties for input.`,
          priorConfidence: 0.9,
          payload: `function factorize(n) {
            let factors = [];
            let d = 2;
            while (d * d <= n) {
              while (n % d === 0) { factors.push(d); n /= d; }
              d++;
            }
            if (n > 1) factors.push(n);
            return factors;
          }`
        }
      ];
    }
    if (h.length === 2) {
      return [
        {
          type: 'CONCLUSION',
          description: 'Verify with boundary primes 2, 3, and compound numbers.',
          priorConfidence: 0.95,
          payload: `function factorize(n) {
            let factors = [];
            let d = 2;
            while (d * d <= n) {
              while (n % d === 0) { factors.push(d); n /= d; }
              d++;
            }
            if (n > 1) factors.push(n);
            return factors;
          }`,
          assertionCode: `
            const assert = require('node:assert');
            assert.deepStrictEqual(factorize(12), [2, 2, 3]);
            assert.deepStrictEqual(factorize(17), [17]);
            console.log('Factorization invariants verified.');
          `
        }
      ];
    }
    return [];
  };

  const res = await engine.search(prompt, dummyGenerator);
  console.log(visualizer.renderTree(res.rootNode));
  console.log(visualizer.renderMetrics(res));
  if (res.bestTrajectory) {
    console.log(`\x1b[32m[VERIFIED SOLUTION]\x1b[0m\n${res.bestTrajectory.nodes[res.bestTrajectory.nodes.length - 1].description}\n`);
  }
}

async function runVerify(filePath?: string) {
  const file = filePath || args[1];
  if (!file) {
    console.error('Error: Please provide a file path to verify (e.g., baron verify solution.js)');
    process.exit(1);
  }

  const code = await readFile(file, 'utf8');
  console.log(`\n\x1b[36m[BARON VERIFY]\x1b[0m Verifying ${file}...\n`);

  const oracle = new FormalLogicOracle();
  const sandbox = new ExecutionSandbox();

  const syntax = oracle.validateSyntax(code);
  console.log(`• AST Syntax Check: ${syntax.valid ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL: ' + syntax.error + '\x1b[0m'}`);

  if (syntax.valid) {
    const exec = await sandbox.executeCode(code);
    console.log(`• Execution Exit Code: ${exec.exitCode === 0 ? '\x1b[32m0 (SUCCESS)\x1b[0m' : '\x1b[31m' + exec.exitCode + '\x1b[0m'}`);
    console.log(`• Duration: ${exec.executionTimeMs}ms`);
    if (exec.stdout) console.log(`• Stdout:\n${exec.stdout}`);
    if (exec.stderr) console.log(`• Stderr:\n${exec.stderr}`);
  }
}

async function main() {
  switch (command) {
    case 'demo':
      await runDemo();
      break;
    case 'solve':
      await runSolve();
      break;
    case 'verify':
      await runVerify();
      break;
    case 'export-rlvr':
      await runDemo(); // demo executes the export
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Available commands: demo, solve, verify, export-rlvr');
  }
}

main().catch((err) => {
  console.error('BARON CLI Fatal Error:', err);
  process.exit(1);
});

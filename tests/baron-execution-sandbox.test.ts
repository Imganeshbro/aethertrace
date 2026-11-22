import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ExecutionSandbox } from '../src/verifier/execution-sandbox.ts';

describe('ExecutionSandbox: Isolated Code Evaluation', () => {
  const sandbox = new ExecutionSandbox({ timeoutMs: 2000 });

  test('executes clean JavaScript code and captures stdout', async () => {
    const code = `
      function fib(n) { return n <= 1 ? n : fib(n - 1) + fib(n - 2); }
      console.log('Result:', fib(7));
    `;

    const res = await sandbox.executeCode(code);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout?.includes('Result: 13'));
    assert.strictEqual(res.error, undefined);
  });

  test('captures runtime exceptions with non-zero exit code', async () => {
    const code = `
      const x = null;
      x.someMethod();
    `;

    const res = await sandbox.executeCode(code);
    assert.strictEqual(res.exitCode, 1);
    assert.ok(res.error !== undefined);
  });

  test('enforces timeout on infinite loops', async () => {
    const code = `
      while (true) {}
    `;

    const res = await sandbox.executeCode(code, { timeoutMs: 800 });
    assert.strictEqual(res.exitCode, 124);
    assert.ok(res.error?.includes('timed out'));
  });

  test('runs assertion blocks successfully against candidate code', async () => {
    const candidate = `
      function add(a, b) { return a + b; }
    `;
    const assertions = `
      const assert = require('node:assert');
      assert.strictEqual(add(2, 3), 5);
      assert.strictEqual(add(-1, 1), 0);
    `;

    const res = await sandbox.runAssertions(candidate, assertions);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.error, undefined);
  });
});

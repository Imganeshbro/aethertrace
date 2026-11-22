import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FormalLogicOracle } from '../src/verifier/formal-logic-oracle.ts';
import { ExecutionSandbox } from '../src/verifier/execution-sandbox.ts';

describe('FormalLogicOracle: SMT/SAT Constraint Solver & Sandbox Fallback', () => {
  const oracle = new FormalLogicOracle();
  const sandbox = new ExecutionSandbox();

  test('solves bounded First-Order Logic constraints and finds satisfying model', () => {
    // System:
    // x in [1, 5]
    // y in [1, 10]
    // Constraints: 2*x + y === 12 && y > 4
    const result = oracle.solveConstraintSystem(
      {
        x: { min: 1, max: 5 },
        y: { min: 1, max: 10 }
      },
      [
        {
          name: 'linear_equality',
          predicate: (vars) => 2 * vars.x + vars.y === 12
        },
        {
          name: 'y_lower_bound',
          predicate: (vars) => vars.y > 4
        }
      ]
    );

    assert.strictEqual(result.satisfiable, true);
    assert.ok(result.model !== undefined);
    assert.strictEqual(2 * result.model.x + result.model.y, 12);
    assert.ok(result.model.y > 4);
  });

  test('proves UNSAT when constraint system contains logical contradiction', () => {
    // System: x > 5 and x < 3 on domain [0, 10]
    const result = oracle.solveConstraintSystem(
      { x: { min: 0, max: 10 } },
      [
        { name: 'gt_5', predicate: (v) => v.x > 5 },
        { name: 'lt_3', predicate: (v) => v.x < 3 }
      ]
    );

    assert.strictEqual(result.satisfiable, false);
    assert.strictEqual(result.model, undefined);
  });

  test('ExecutionSandbox handles executePython gracefully without crashing', async () => {
    const res = await sandbox.executePython('print("Hello from Python")');
    // Regardless of host python availability, executePython returns valid ExecutionArtifacts
    assert.ok(typeof res.exitCode === 'number');
    assert.ok(typeof res.executionTimeMs === 'number');
  });
});

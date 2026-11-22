import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FormalLogicOracle } from '../src/verifier/formal-logic-oracle.ts';

describe('FormalLogicOracle: AST & Invariant Validation', () => {
  const oracle = new FormalLogicOracle();

  test('validates valid JavaScript syntax', () => {
    const code = `const a = [1, 2, 3].map(x => x * 2);`;
    const res = oracle.validateSyntax(code);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.error, undefined);
  });

  test('rejects malformed syntax before execution', () => {
    const brokenCode = `function test() { return [;`;
    const res = oracle.validateSyntax(brokenCode);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('SyntaxError'));
  });

  test('evaluates state invariants and catches counter-examples', () => {
    const state = { count: -5, limit: 100 };
    const invariants = [
      {
        name: 'non_negative_count',
        predicate: (s: any) => s.count >= 0,
        expectedDescription: 'Count must be non-negative'
      },
      {
        name: 'within_limit',
        predicate: (s: any) => s.count <= s.limit,
        expectedDescription: 'Count must not exceed limit'
      }
    ];

    const results = oracle.verifyInvariants(state, invariants);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].passed, false);
    assert.strictEqual(results[0].invariantName, 'non_negative_count');
    assert.ok(results[0].counterExample?.includes('"count": -5'));
    assert.strictEqual(results[1].passed, true);
  });

  test('detects blatant logical contradictions', () => {
    const statements = [
      'We know that sorting is possible in linear time for integers.',
      'However, comparison sort is impossible in under O(n log n).'
    ];
    const res = oracle.detectContradiction(statements);
    assert.strictEqual(res.contradictionDetected, true);
  });
});

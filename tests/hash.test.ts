import { test, describe } from 'node:test';
import assert from 'node:assert';
import { computeSha256, canonicalJson, generateId } from '../src/utils/hash.ts';

describe('Hash & Serialization Utilities', () => {
  test('canonicalJson produces identical outputs regardless of key order', () => {
    const objA = { z: 1, a: 2, m: { nestedB: true, nestedA: 'hello' } };
    const objB = { a: 2, m: { nestedA: 'hello', nestedB: true }, z: 1 };

    assert.strictEqual(canonicalJson(objA), canonicalJson(objB));
  });

  test('computeSha256 produces deterministic 64-char hex hash', () => {
    const hash1 = computeSha256({ action: 'tool_call', name: 'search' });
    const hash2 = computeSha256({ name: 'search', action: 'tool_call' });

    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
  });

  test('generateId produces prefixed unique IDs', () => {
    const id1 = generateId('step');
    const id2 = generateId('step');

    assert.ok(id1.startsWith('step_'));
    assert.ok(id2.startsWith('step_'));
    assert.notStrictEqual(id1, id2);
  });
});

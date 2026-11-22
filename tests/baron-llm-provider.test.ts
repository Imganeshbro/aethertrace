import { test, describe } from 'node:test';
import assert from 'node:assert';
import { HeuristicProvider, getActiveProvider, OpenAICompatibleProvider } from '../src/providers/llm-provider.ts';
import { ThoughtNode } from '../src/core/thought-node.ts';

describe('LLMProvider Fabric: Multi-Provider Reasoning Generators', () => {
  test('HeuristicProvider generates progressive candidates by tree depth', async () => {
    const provider = new HeuristicProvider();

    // Depth 1
    const root = new ThoughtNode({ id: 'root', description: 'Objective S0' });
    const cands1 = await provider.generateCandidates('Invert binary tree', [root]);
    assert.strictEqual(cands1.length, 3);
    assert.strictEqual(cands1[0].type, 'HYPOTHESIS');

    // Depth 2
    const step2 = new ThoughtNode({ id: 'step2', description: 'Deduction step' });
    const cands2 = await provider.generateCandidates('Invert binary tree', [root, step2]);
    assert.strictEqual(cands2.length, 1);
    assert.strictEqual(cands2[0].type, 'DEDUCTION');

    // Depth 3 (Terminal)
    const step3 = new ThoughtNode({ id: 'step3', description: 'Final logic' });
    const cands3 = await provider.generateCandidates('Invert binary tree', [root, step2, step3]);
    assert.strictEqual(cands3.length, 1);
    assert.strictEqual(cands3[0].type, 'CONCLUSION');
    assert.ok(cands3[0].assertionCode !== undefined);
  });

  test('getActiveProvider factory selects heuristic by default in offline environment', () => {
    const provider = getActiveProvider({ provider: 'heuristic' });
    assert.strictEqual(provider.name, 'heuristic');
  });

  test('OpenAICompatibleProvider gracefully falls back to heuristic on connection timeout', async () => {
    const provider = new OpenAICompatibleProvider({
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:59999/v1' // Non-existent port
    });

    const root = new ThoughtNode({ id: 'root', description: 'Test prompt' });
    const cands = await provider.generateCandidates('Test objective', [root]);
    assert.ok(cands.length > 0, 'Should fall back gracefully without throwing');
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MCTSEngine, type CandidateStepProposal } from '../src/core/mcts-engine.ts';

describe('MCTSEngine: PUCT Search, Convergence & Backtracking', () => {
  test('executes multi-step search, prunes errors, and converges on verified conclusion', async () => {
    const engine = new MCTSEngine({
      maxDepth: 3,
      maxRollouts: 10,
      explorationConstant: 1.414,
      pruningThreshold: -0.2
    });

    const mockGenerator = async (prompt: string, history: any[]): Promise<CandidateStepProposal[]> => {
      const depth = history.length;
      if (depth === 1) {
        return [
          {
            type: 'HYPOTHESIS',
            description: 'Option 1: Flawed invalid syntax',
            priorConfidence: 0.3,
            payload: 'function broken() { return [;'
          },
          {
            type: 'HYPOTHESIS',
            description: 'Option 2: Valid prime sieve hypothesis',
            priorConfidence: 0.8,
            payload: 'function isPrime(n) { return n > 1; }'
          }
        ];
      }

      if (depth === 2) {
        return [
          {
            type: 'CONCLUSION',
            description: 'Terminal step: Verified prime property with unit assertions',
            priorConfidence: 0.95,
            payload: 'function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }',
            assertionCode: `
              const assert = require('node:assert');
              assert.strictEqual(isPrime(2), true);
              assert.strictEqual(isPrime(4), false);
              assert.strictEqual(isPrime(17), true);
            `
          }
        ];
      }

      return [];
    };

    const res = await engine.search('Find primes under 100', mockGenerator);

    assert.ok(res.totalRollouts > 0);
    assert.strictEqual(res.converged, true);
    assert.ok(res.bestTrajectory !== null);
    assert.ok(res.prunedBranchesCount >= 1, 'Should have pruned the broken syntax branch');
    assert.ok(res.tokensSavedByPruning > 0, 'Should have recorded saved tokens');
    assert.strictEqual(res.bestTrajectory?.nodes[res.bestTrajectory.nodes.length - 1].type, 'CONCLUSION');
  });

  test('handles complete deadlock gracefully', async () => {
    const engine = new MCTSEngine({ maxDepth: 2, maxRollouts: 3 });
    const emptyGenerator = async () => [];

    const res = await engine.search('Impossible problem', emptyGenerator);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.rootNode.status, 'PRUNED');
  });
});

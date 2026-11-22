/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Formal Logic Oracle: AST Syntax Verification, Mathematical Invariant Checking & Counter-Example Extraction
 */

import vm from 'node:vm';

export interface InvariantCheckResult {
  passed: boolean;
  invariantName: string;
  expected: string;
  actual?: string;
  counterExample?: string;
  error?: string;
}

export class FormalLogicOracle {
  /**
   * Pre-execution AST Syntax check: Verifies if code is syntactically valid without executing
   */
  validateSyntax(code: string): { valid: boolean; error?: string } {
    try {
      new vm.Script(code);
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: `SyntaxError: ${err?.message ?? 'Invalid JavaScript/TypeScript syntax'}`
      };
    }
  }

  /**
   * Verify mathematical and domain invariants
   */
  verifyInvariants(
    state: Record<string, any>,
    invariants: Array<{
      name: string;
      predicate: (s: Record<string, any>) => boolean;
      expectedDescription: string;
    }>
  ): InvariantCheckResult[] {
    const results: InvariantCheckResult[] = [];

    for (const inv of invariants) {
      try {
        const passed = inv.predicate(state);
        results.push({
          passed,
          invariantName: inv.name,
          expected: inv.expectedDescription,
          actual: passed ? 'Invariant holds' : 'Predicate returned false',
          counterExample: passed ? undefined : JSON.stringify(state, null, 2)
        });
      } catch (err: any) {
        results.push({
          passed: false,
          invariantName: inv.name,
          expected: inv.expectedDescription,
          actual: 'Predicate threw error',
          counterExample: JSON.stringify(state, null, 2),
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Check logical monotonicity (e.g. error count must decrease or score must improve)
   */
  checkMonotonicProgress(previousMetric: number, currentMetric: number, direction: 'ASCENDING' | 'DESCENDING'): boolean {
    if (direction === 'ASCENDING') {
      return currentMetric >= previousMetric;
    }
    return currentMetric <= previousMetric;
  }

  /**
   * Detect logical contradictions in reasoning step statements
   */
  detectContradiction(statements: string[]): { contradictionDetected: boolean; explanation?: string } {
    const negations: Array<{ affirmative: string; negative: string }> = [
      { affirmative: 'is possible', negative: 'is impossible' },
      { affirmative: 'can be done', negative: 'cannot be done' },
      { affirmative: 'true', negative: 'false' },
      { affirmative: 'increases', negative: 'decreases' },
      { affirmative: 'converges', negative: 'diverges' }
    ];

    const lowerText = statements.join(' ').toLowerCase();

    for (const pair of negations) {
      if (lowerText.includes(pair.affirmative) && lowerText.includes(pair.negative)) {
        // Simple heuristic check for direct antithetical statements in adjacent thoughts
        return {
          contradictionDetected: true,
          explanation: `Contradiction detected: statement contains both '${pair.affirmative}' and '${pair.negative}'`
        };
      }
    }

    return { contradictionDetected: false };
  }
}

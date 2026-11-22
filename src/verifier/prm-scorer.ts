/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Process Reward Model (PRM) Scorer: Step-Level Reasoning Grading
 */

export interface PRMEvaluationInput {
  prompt: string;
  previousThoughts: string[];
  currentThought: string;
  stepType: string;
}

export interface PRMScoreOutput {
  score: number;               // Normalized score in [-1.0, 1.0]
  goalAlignment: number;       // [0, 1.0]
  logicalContinuity: number;   // [0, 1.0]
  informationDensity: number;  // [0, 1.0]
  reasoning: string;
}

export class PRMScorer {
  /**
   * Score an intermediate reasoning step
   */
  async scoreStep(input: PRMEvaluationInput): Promise<PRMScoreOutput> {
    const { prompt, previousThoughts, currentThought } = input;

    // 1. Goal Alignment: Check semantic overlap of key concepts with original prompt
    const promptKeywords = this.extractKeywords(prompt);
    const thoughtKeywords = this.extractKeywords(currentThought);
    const overlapCount = thoughtKeywords.filter((k) => promptKeywords.includes(k)).length;
    const goalAlignment = promptKeywords.length > 0
      ? Math.min(1.0, 0.5 + (overlapCount / Math.max(1, Math.min(promptKeywords.length, 3))) * 0.5)
      : 0.8;

    // 2. Logical Continuity: Ensure step does not merely echo previous step
    let logicalContinuity = 0.85;
    if (previousThoughts.length > 0) {
      const lastThought = previousThoughts[previousThoughts.length - 1];
      const similarity = this.calculateJaccardSimilarity(lastThought, currentThought);

      if (similarity > 0.80) {
        // Tautological repetition
        logicalContinuity = 0.1;
      } else if (similarity < 0.05 && previousThoughts.length > 1) {
        // Sudden topic jump / hallucination
        logicalContinuity = 0.4;
      } else {
        logicalContinuity = 0.9;
      }
    }

    // 3. Information Density: Penalize filler language
    const fillerPatterns = [
      /as an ai/i,
      /let me think/i,
      /obviously/i,
      /in conclusion/i,
      /certainly/i,
      /i will now proceed/i
    ];

    let fillerCount = 0;
    for (const pat of fillerPatterns) {
      if (pat.test(currentThought)) {
        fillerCount++;
      }
    }
    const informationDensity = Math.max(0.2, 1.0 - fillerCount * 0.25);

    // Compute composite PRM score in range [-1.0, 1.0]
    const compositeRaw = (goalAlignment * 0.4) + (logicalContinuity * 0.4) + (informationDensity * 0.2);
    const repetitionPenalty = logicalContinuity < 0.3 ? -0.8 : 0;
    // Map [0, 1] to [-1.0, 1.0] with penalty applied
    const normalizedScore = Math.max(-1.0, Math.min(1.0, (compositeRaw - 0.5) * 2.0 + repetitionPenalty));

    let reasoning = 'Reasoning step logically sound and aligned with problem objective.';
    if (logicalContinuity < 0.3) {
      reasoning = 'Repetitive step detected with near-zero logical progression.';
    } else if (informationDensity < 0.5) {
      reasoning = 'Excessive filler phrases reduce reasoning density.';
    }

    return {
      score: Number(normalizedScore.toFixed(3)),
      goalAlignment: Number(goalAlignment.toFixed(3)),
      logicalContinuity: Number(logicalContinuity.toFixed(3)),
      informationDensity: Number(informationDensity.toFixed(3)),
      reasoning
    };
  }

  /**
   * Aggregate deterministic verification with PRM score
   * Formula: R(s) = alpha * R_det + (1 - alpha) * R_prm
   */
  computeCompositeReward(
    deterministicPassed: boolean,
    prmScore: number,
    alpha: number = 0.70,
    isFatal: boolean = false
  ): number {
    if (isFatal) {
      return -Infinity;
    }

    const rDet = deterministicPassed ? 1.0 : -1.0;
    const rPrm = Math.max(-1.0, Math.min(1.0, prmScore));

    const composite = (alpha * rDet) + ((1 - alpha) * rPrm);
    return Number(composite.toFixed(3));
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);
  }

  private calculateJaccardSimilarity(textA: string, textB: string): number {
    const setA = new Set(this.extractKeywords(textA));
    const setB = new Set(this.extractKeywords(textB));

    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }
}

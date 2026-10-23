import type {
  TraceBundle,
  TrajectoryNode,
  ForkExecutionOptions
} from '../types/index.ts';
import { FlightRecorder } from './recorder.ts';
import { computeSha256 } from '../utils/hash.ts';

export interface TrajectoryDiff {
  commonStepCount: number;
  originalFailureStep?: number;
  forkStep: number;
  divergenceNodeOriginal?: TrajectoryNode;
  divergenceNodeForked?: TrajectoryNode;
  resolvedFailure: boolean;
}

export class TimeTravelEngine {
  private baseBundle: TraceBundle;

  constructor(baseBundle: TraceBundle) {
    this.baseBundle = baseBundle;
  }

  public getBaseBundle(): TraceBundle {
    return this.baseBundle;
  }

  /**
   * Rewinds the trajectory up to the specified step index (inclusive).
   */
  public scrubToStep(stepIndex: number): TrajectoryNode[] {
    if (stepIndex < 0) return [];
    return this.baseBundle.nodes.slice(0, stepIndex + 1);
  }

  /**
   * Forks the trajectory at a specified step index.
   * Steps 0 through (forkAtStep - 1) are replayed deterministically from the trace (0 tokens spent).
   * At forkAtStep, an optional override payload can be injected to alter downstream execution.
   */
  public async createFork(options: ForkExecutionOptions): Promise<FlightRecorder> {
    const { forkAtStep, overridePayload, overrideTitle } = options;

    if (forkAtStep < 0 || forkAtStep >= this.baseBundle.nodes.length) {
      throw new Error(`Fork step index ${forkAtStep} is out of bounds (0..${this.baseBundle.nodes.length - 1})`);
    }

    const forkRecorder = new FlightRecorder(
      `${this.baseBundle.metadata.sessionName}_fork_step${forkAtStep}`,
      this.baseBundle.metadata.agentCommand
    );

    // Replay historical steps [0 ... forkAtStep - 1] with zero token cost
    for (let i = 0; i < forkAtStep; i++) {
      const historical = this.baseBundle.nodes[i];
      await forkRecorder.recordStep(
        historical.type,
        historical.title,
        historical.content,
        {
          causalParents: historical.causalParents,
          metadata: {
            ...historical.metadata,
            ghostReplay: true,
            replayedFromStep: historical.stepIndex
          },
          tokens: { prompt: 0, completion: 0, total: 0 }, // 0 tokens for replayed steps
          costUsd: 0
        }
      );
    }

    // Inject the counterfactual fork step
    const originalStep = this.baseBundle.nodes[forkAtStep];
    const newContent = overridePayload !== undefined ? overridePayload : originalStep.content;
    const newTitle = overrideTitle || `[FORK] ${originalStep.title}`;

    await forkRecorder.recordStep(
      originalStep.type,
      newTitle,
      newContent,
      {
        causalParents: forkAtStep > 0 ? [forkRecorder.getNodes()[forkAtStep - 1].id] : [],
        metadata: {
          ...originalStep.metadata,
          isCounterfactualFork: true,
          originalContentHash: originalStep.contentHash,
          forkedAtTimestamp: new Date().toISOString()
        }
      }
    );

    return forkRecorder;
  }

  /**
   * Compares the original trajectory with a counterfactual fork to assess whether
   * the downstream failure was resolved.
   */
  public static compareTrajectories(
    original: TraceBundle,
    forked: TraceBundle,
    forkAtStep: number
  ): TrajectoryDiff {
    const origFailure = original.nodes.find(n => n.status === 'ERROR' || n.status === 'VETOED');
    const forkedFailure = forked.nodes.find(n => n.status === 'ERROR' || n.status === 'VETOED');

    const origHasFailed = !!origFailure || original.metadata.status !== 'SUCCESS';
    const forkedHasFailed = !!forkedFailure || forked.metadata.status !== 'SUCCESS';

    const originalDivergence = original.nodes[forkAtStep];
    const forkedDivergence = forked.nodes[forkAtStep];

    const resolvedFailure = origHasFailed && !forkedHasFailed;

    return {
      commonStepCount: forkAtStep,
      originalFailureStep: origFailure?.stepIndex,
      forkStep: forkAtStep,
      divergenceNodeOriginal: originalDivergence,
      divergenceNodeForked: forkedDivergence,
      resolvedFailure
    };
  }
}

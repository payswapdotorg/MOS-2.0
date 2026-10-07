import type { Timestamp } from '@mos/contracts';
import type {
  EnsembleError,
  EnsembleEvaluationInput,
  EnsemblePort,
  EnsemblePrediction,
} from '../contracts/ensemble.js';
import type { PredictionInterval } from '../contracts/evidence.js';
import type {
  LearnedStrategyCandidate,
  LearnedStrategyCandidateId,
  LearningStoppingPolicy,
  LearningTrace,
  LearningTraceIteration,
  StrategyLearningError,
  StrategyLearningInput,
  StrategyLearningPort,
  VariantEvaluation,
} from '../contracts/strategy-learning.js';
import type { CandidateProgramStrategy } from '../contracts/reward.js';
import {
  computeRewardValue,
  halfSpreadOf,
  meanOf,
  validateRewardSpec,
} from './reward-computation.js';
import {
  deepFreeze,
  mixStepSeed,
  predictionId,
  validateStrategyActionCandidate,
} from './parametric-support.js';

/**
 * The in-memory sequential strategy learner (LAB-009).
 *
 * W4-A DISCLOSURE — THE FULL DOCUMENTED ALGORITHM (deterministic coordinate
 * search over the candidate's numeric knobs; no invented sophistication):
 *
 * ```
 * rolloutSeeds = [mix(seed,101), mix(seed,202), mix(seed,303)]  (fixed 3)
 * moves        = cadence ±2/week, novelty ±0.1, engagementEffort ±0.1
 *                (clamped into knob ranges; quantized to 1e-10; no-op
 *                incumbents never move cadence; the strategy kind and ref
 *                stay fixed — kind transitions are LAB-016 program search)
 * R(s,t)       = Σ_j sign(d_j) · w_j · v_j(s,t)   over ensemble-predicted
 *                metrics/deltas ONLY (simulation experience — no history)
 * estimate(v)  = mean over (s,t) of R(s,t) for candidate v
 * interval     = estimate ± (ε_ens + ε_seed)
 *                ε_ens  = half the member spread of expected reward
 *                ε_seed = half the (max−min) spread of per-seed averages
 * choose       = the FIRST best neighbor (fixed move order tie-break) whose
 *                estimate beats the incumbent's by > plateauTolerance;
 *                otherwise the incumbent stays
 * stop         = checked before each would-be iteration, in DECLARED
 *                precedence: budget → plateau window → iteration cap (the
 *                cap ends the loop naturally after maxIterations)
 * cost         = one member step = 1; an iteration costs
 *                variants × 3 seeds × horizon × memberCount member steps
 *                (the §2 delay-economics variable appears only as this
 *                declared `simulatedSteps` cost dimension — LAB-015 owns
 *                production delay economics)
 * ```
 *
 * DISCLOSED LIMIT: like LAB-008, the horizon is evaluated as STATIONARY
 * steps (the LAB-004 engine steps from the registered world-model state —
 * cross-step world evolution is not modeled this wave).
 *
 * The learner composes the LAB-007 ensemble ONLY — it has NO Time Machine
 * access (learning is from simulation experience only) and NO output
 * surface beyond counterfactual-labeled candidates: it stays inside the lab
 * (§24 boundary untouched).
 */

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: StrategyLearningError['error'], message: string): StrategyLearningError => ({
  error,
  message,
});

const quantize = (value: number): number => Math.round(value * 1e10) / 1e10;

/** §22 level from a relative half-width (< 5% low, < 15% moderate, else high). */
const relativeLevel = (
  expected: number,
  halfWidth: number,
): 'low' | 'moderate' | 'high' => {
  const magnitude = Math.abs(expected);
  const relative = magnitude === 0 ? (halfWidth === 0 ? 0 : 1) : halfWidth / magnitude;
  return relative < 0.05 ? 'low' : relative < 0.15 ? 'moderate' : 'high';
};

const ROLLOUT_SEED_MIXES = [101, 202, 303] as const;

/** Options for {@link createInMemoryStrategyLearner}. */
export interface InMemoryStrategyLearnerOptions {
  /** The LAB-007 ensemble (evaluation + version reads). */
  readonly ensemble: Pick<
    EnsemblePort,
    'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'
  >;
  /** Injectable clock for deterministic `learnedAt` stamps. */
  readonly now?: () => Timestamp;
}

interface VariantEstimate {
  readonly evaluation: VariantEvaluation;
  readonly memberRewards: readonly number[];
  readonly perSeedAverages: readonly number[];
}

export function createInMemoryStrategyLearner(
  options: InMemoryStrategyLearnerOptions,
): StrategyLearningPort {
  const now = options.now ?? nowDefault;

  const rolloutSeeds = (seed: number): number[] =>
    ROLLOUT_SEED_MIXES.map((mix) => mixStepSeed(seed, mix));

  const neighborsOf = (
    incumbent: CandidateProgramStrategy,
  ): CandidateProgramStrategy[] => {
    type Knob = 'cadencePerWeek' | 'novelty' | 'engagementEffort';
    const moves: readonly { readonly knob: Knob; readonly delta: number }[] = [
      { knob: 'cadencePerWeek', delta: 2 },
      { knob: 'cadencePerWeek', delta: -2 },
      { knob: 'novelty', delta: 0.1 },
      { knob: 'novelty', delta: -0.1 },
      { knob: 'engagementEffort', delta: 0.1 },
      { knob: 'engagementEffort', delta: -0.1 },
    ];
    const knobRange: Record<Knob, { readonly lower: number; readonly upper: number }> = {
      cadencePerWeek: { lower: 0, upper: Number.POSITIVE_INFINITY },
      novelty: { lower: 0, upper: 1 },
      engagementEffort: { lower: 0, upper: 1 },
    };
    const neighbors: CandidateProgramStrategy[] = [];
    for (const move of moves) {
      if (incumbent.kind === 'no-op' && move.knob === 'cadencePerWeek') {
        continue; // a no-op carries zero cadence by contract (lock rule 5)
      }
      const range = knobRange[move.knob];
      const base = incumbent[move.knob];
      const moved = quantize(Math.min(range.upper, Math.max(range.lower, base + move.delta)));
      if (moved === base) {
        continue; // clamped into the incumbent — not a move
      }
      neighbors.push({ ...incumbent, [move.knob]: moved });
    }
    return neighbors;
  };

  const estimateVariant = async (
    input: StrategyLearningInput,
    candidate: CandidateProgramStrategy,
  ): Promise<VariantEstimate | StrategyLearningError> => {
    const seeds = rolloutSeeds(input.seed);
    const series: number[] = [];
    const memberRewards: number[] = [];
    for (const seed of seeds) {
      for (let step = 0; step < input.initialProgram.horizonSteps; step += 1) {
        const evaluationInput: EnsembleEvaluationInput = {
          scope: input.scope,
          ensembleId: input.ensembleId,
          ensembleVersion: input.ensembleVersion,
          scenario: input.scenario,
          candidate,
          seed,
          step,
        };
        const prediction: EnsemblePrediction | EnsembleError =
          await options.ensemble.evaluateEnsemble(evaluationInput);
        if ('error' in prediction) {
          return fail(
            'ensemble-evaluation-failed',
            `ensemble evaluation failed at (seed ${seed}, step ${step}): [${prediction.error}] ${prediction.message}`,
          );
        }
        const domains = {
          predictedMetrics: new Map(
            prediction.metrics.map((metric) => [metric.metric, metric.expectedValue]),
          ),
          predictedDeltas: new Map(
            prediction.deltas.map((delta) => [delta.metric, delta.expectedDelta]),
          ),
        };
        const outcome = computeRewardValue(input.rewardSpec, domains);
        if ('failure' in outcome) {
          return fail(
            'reward-term-not-derivable',
            `reward term source "${outcome.metricSource}" does not resolve in any ensemble-predicted metric domain (learning is simulation-only; resolution failure: ${outcome.failure})`,
          );
        }
        series.push(outcome.reward);
        for (const member of prediction.memberPredictions) {
          const memberDomains = {
            predictedMetrics: new Map(
              member.prediction.metrics.map((metric) => [metric.metric, metric.expectedValue]),
            ),
            predictedDeltas: new Map(
              member.prediction.deltas.map((delta) => [delta.metric, delta.expectedDelta]),
            ),
          };
          const memberOutcome = computeRewardValue(input.rewardSpec, memberDomains);
          if ('failure' in memberOutcome) {
            return fail(
              'reward-term-not-derivable',
              `member ${member.memberId}: reward term source "${memberOutcome.metricSource}" does not resolve (resolution failure: ${memberOutcome.failure})`,
            );
          }
          memberRewards.push(memberOutcome.reward);
        }
      }
    }
    const estimatedReward = meanOf(series);
    const epsilonEnsemble = halfSpreadOf(memberRewards);
    const perSeedAverages = seeds.map((_, index) =>
      meanOf(
        series.slice(
          index * input.initialProgram.horizonSteps,
          (index + 1) * input.initialProgram.horizonSteps,
        ),
      ),
    );
    const epsilonSeed = halfSpreadOf(perSeedAverages);
    const halfWidth = epsilonEnsemble + epsilonSeed;
    const interval: PredictionInterval = {
      lower: estimatedReward - halfWidth,
      upper: estimatedReward + halfWidth,
    };
    return {
      evaluation: { candidate, estimatedReward, interval },
      memberRewards,
      perSeedAverages,
    };
  };

  return {
    async learnStrategy(
      input: StrategyLearningInput,
    ): Promise<LearnedStrategyCandidate | StrategyLearningError> {
      // ---- 1. structural validation (fail closed, named codes) ----
      const candidateFault = validateStrategyActionCandidate(input.initialProgram.candidate);
      if (candidateFault !== null) {
        return fail('invalid-input', candidateFault);
      }
      if (
        !Number.isInteger(input.initialProgram.horizonSteps) ||
        input.initialProgram.horizonSteps < 1
      ) {
        return fail('invalid-input', 'initialProgram.horizonSteps must be an integer >= 1');
      }
      if (typeof input.seed !== 'number' || !Number.isFinite(input.seed)) {
        return fail('invalid-input', 'seed is required and must be a finite number');
      }
      const policy: LearningStoppingPolicy = input.stoppingPolicy;
      const policyFaults: readonly [boolean, string][] = [
        [!Number.isInteger(policy.maxIterations) || policy.maxIterations < 1, 'maxIterations must be an integer >= 1'],
        [!Number.isInteger(policy.maxSimulatedSteps) || policy.maxSimulatedSteps < 1, 'maxSimulatedSteps must be an integer >= 1'],
        [!Number.isInteger(policy.plateauWindow) || policy.plateauWindow < 1, 'plateauWindow must be an integer >= 1'],
        [typeof policy.plateauTolerance !== 'number' || !Number.isFinite(policy.plateauTolerance) || policy.plateauTolerance < 0, 'plateauTolerance must be a finite number >= 0'],
      ];
      for (const [bad, detail] of policyFaults) {
        if (bad) {
          return fail('invalid-input', `stoppingPolicy.${detail}`);
        }
      }
      const specFault = validateRewardSpec(input.rewardSpec);
      if (specFault !== null) {
        return fail('invalid-input', specFault);
      }

      // ---- 2. ensemble existence + version ----
      const ensembleRecord = await options.ensemble.getEnsemble(
        input.scope,
        input.ensembleId,
        input.ensembleVersion,
      );
      if (ensembleRecord === null) {
        const latest = await options.ensemble.resolveLatestEnsemble(
          input.scope,
          input.ensembleId,
        );
        if (latest === null) {
          return fail(
            'unknown-ensemble',
            `no ensemble ${input.ensembleId} visible in this tenant scope`,
          );
        }
        return fail(
          'ensemble-version-not-found',
          `ensemble ${input.ensembleId} has no version ${input.ensembleVersion} in this tenant scope (latest is ${latest.version})`,
        );
      }
      if (
        ensembleRecord.niche !== input.scenario.niche ||
        ensembleRecord.platform !== input.scenario.platform
      ) {
        return fail(
          'invalid-input',
          `scenario (${input.scenario.niche}/${input.scenario.platform}) does not match ensemble ${input.ensembleId} v${input.ensembleVersion} (${ensembleRecord.niche}/${ensembleRecord.platform})`,
        );
      }

      // ---- 3. reward spec version pin ----
      if (input.rewardSpec.version !== input.scenario.rewardVersion) {
        return fail(
          'reward-version-mismatch',
          `rewardSpec.version ${input.rewardSpec.version} does not match scenario.rewardVersion ${input.scenario.rewardVersion}`,
        );
      }

      // ---- 4. budget floor: at least one full (worst-case) iteration ----
      const memberCount = ensembleRecord.members.length;
      const worstCaseIterationSteps =
        7 * ROLLOUT_SEED_MIXES.length * input.initialProgram.horizonSteps * memberCount;
      if (policy.maxSimulatedSteps < worstCaseIterationSteps) {
        return fail(
          'invalid-input',
          `stoppingPolicy.maxSimulatedSteps ${policy.maxSimulatedSteps} cannot cover even one worst-case iteration (${worstCaseIterationSteps} member steps = 7 variants × ${ROLLOUT_SEED_MIXES.length} seeds × ${input.initialProgram.horizonSteps} steps × ${memberCount} members)`,
        );
      }

      // ---- 5. the learning loop (deterministic coordinate search) ----
      let incumbent: CandidateProgramStrategy = input.initialProgram.candidate;
      let incumbentEstimate: VariantEstimate | null = null;
      let cumulativeSteps = 0;
      let plateauStreak = 0;
      const iterations: LearningTraceIteration[] = [];
      let stoppingReason: LearningTrace['stoppingReason'] = 'iteration-cap-reached';
      let stoppingDetail = '';

      for (let iteration = 1; iteration <= policy.maxIterations; iteration += 1) {
        const neighbors = neighborsOf(incumbent);
        // Cost counts member steps ACTUALLY executed this iteration: the
        // incumbent evaluation is cached from the previous iteration (same
        // seeds, stationary deterministic evaluation) — only fresh variants
        // are charged. The first iteration always evaluates the incumbent.
        const incumbentIsCached = incumbentEstimate !== null;
        const iterationSteps =
          (neighbors.length + (incumbentIsCached ? 0 : 1)) *
          ROLLOUT_SEED_MIXES.length *
          input.initialProgram.horizonSteps *
          memberCount;
        if (cumulativeSteps + iterationSteps > policy.maxSimulatedSteps) {
          stoppingReason = 'budget-exhausted';
          stoppingDetail = `member-step budget ${policy.maxSimulatedSteps} exhausted after ${iterations.length} iteration(s) (next iteration needs ${iterationSteps})`;
          break;
        }
        if (plateauStreak >= policy.plateauWindow) {
          stoppingReason = 'plateau-detected';
          stoppingDetail = `${plateauStreak} consecutive iteration(s) without an improvement above plateauTolerance ${policy.plateauTolerance}`;
          break;
        }

        const evaluated: VariantEvaluation[] = [];
        const incumbentResult: VariantEstimate | StrategyLearningError =
          incumbentEstimate ?? (await estimateVariant(input, incumbent));
        if ('error' in incumbentResult) {
          return incumbentResult;
        }
        incumbentEstimate = incumbentResult;
        evaluated.push(incumbentResult.evaluation);

        let bestNeighbor: VariantEstimate | null = null;
        for (const neighbor of neighbors) {
          const neighborResult = await estimateVariant(input, neighbor);
          if ('error' in neighborResult) {
            return neighborResult;
          }
          evaluated.push(neighborResult.evaluation);
          if (
            bestNeighbor === null ||
            neighborResult.evaluation.estimatedReward >
              bestNeighbor.evaluation.estimatedReward
          ) {
            bestNeighbor = neighborResult;
          }
        }

        const improvement =
          bestNeighbor === null
            ? 0
            : bestNeighbor.evaluation.estimatedReward -
              incumbentResult.evaluation.estimatedReward;
        const improved = improvement > policy.plateauTolerance;
        const chosen = improved && bestNeighbor !== null
          ? bestNeighbor.evaluation.candidate
          : incumbent;
        if (improved && bestNeighbor !== null) {
          incumbent = bestNeighbor.evaluation.candidate;
          incumbentEstimate = bestNeighbor;
          plateauStreak = 0;
        } else {
          plateauStreak += 1;
        }
        cumulativeSteps += iterationSteps;
        iterations.push(
          deepFreeze({
            iteration,
            evaluated,
            chosen,
            improvement,
            improved,
            costs: {
              simulatedSteps: iterationSteps,
              cumulativeSimulatedSteps: cumulativeSteps,
            },
          } satisfies LearningTraceIteration),
        );
      }

      if (stoppingDetail === '') {
        stoppingDetail = `iteration cap ${policy.maxIterations} reached`;
      }

      const finalEstimate = incumbentEstimate;

      const trace: LearningTrace = deepFreeze({
        iterations,
        stoppingReason,
        stoppingDetail,
        totalSimulatedSteps: cumulativeSteps,
        finalEstimate: finalEstimate
          ? {
              reward: finalEstimate.evaluation.estimatedReward,
              interval: finalEstimate.evaluation.interval,
              uncertainty: {
                level: relativeLevel(
                  finalEstimate.evaluation.estimatedReward,
                  (finalEstimate.evaluation.interval.upper -
                    finalEstimate.evaluation.interval.lower) /
                    2,
                ),
                note: 'final incumbent estimate from simulation experience only (§22) — ensemble disagreement + seed spread; NOT ground truth',
              },
            }
          : null,
      });

      const candidate: LearnedStrategyCandidate = deepFreeze({
        id: predictionId('learned', [
          input.ensembleId,
          input.ensembleVersion,
          input.initialProgram.candidate.strategyRef,
          input.rewardSpec.version,
          input.seed,
        ]) as LearnedStrategyCandidateId,
        tenantId: input.scope.tenantId,
        candidate: incumbent,
        horizonSteps: input.initialProgram.horizonSteps,
        trace,
        provenance: {
          ensembleId: input.ensembleId,
          ensembleVersion: input.ensembleVersion,
          memberWorldModelVersions: ensembleRecord.members.map((m) => m.worldModelVersion),
          simulatorVersion: input.scenario.simulatorVersion,
          rewardSpecVersion: input.rewardSpec.version,
          seed: input.seed,
          iterationCount: iterations.length,
          stoppingReason,
          parentStrategyRef: input.initialProgram.candidate.strategyRef,
          learnedAt: now(),
        },
        counterfactual: true,
        disclosure: 'learned-in-simulation',
        labOnly:
          'learned from simulation experience only — a lab candidate, never a deployment decision; the real-experiment boundary (§24) is untouched',
      });
      return candidate;
    },
  };
}

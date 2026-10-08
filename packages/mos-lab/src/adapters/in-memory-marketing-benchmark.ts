import type { TenantId, Timestamp, TenantScope } from '@mos/contracts';
import type {
  EnsembleEvaluationInput,
  EnsemblePort,
  EnsemblePrediction,
  WorldModelEnsemble,
} from '../contracts/ensemble.js';
import type {
  BenchmarkIntegrityReport,
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from '../contracts/robust-benchmark-port.js';
import type {
  BenchmarkProvenance,
  BenchmarkWorldModelPin,
  RobustBenchmarkResult,
} from '../contracts/robust-benchmark-result.js';
import type {
  BenchmarkCandidate,
  MarketingBenchmarkInput,
  RobustBenchmarkError,
  RobustBenchmarkId,
} from '../contracts/robust-benchmark.js';
import { validateRewardSpec } from './reward-computation.js';
import { cloneDeep, deepFreeze } from './parametric-support.js';
import {
  digestOf,
  evaluateCandidateRobustness,
  rankBenchmarkEntries,
} from './benchmark-support.js';
import type { EvaluatedEntry, WorldRollout } from './benchmark-support.js';
import {
  isNoopBaselineClaim,
  noopBaselineCandidate,
  validateBenchmarkCandidate,
  validateRobustnessPolicy,
} from './benchmark-validation.js';

/**
 * The in-memory robust marketing benchmark (LAB-017).
 *
 * W9-A DISCLOSURE — DETERMINISTIC SYNTHETIC BENCHMARK, NOT GROUND TRUTH.
 * Evaluation runs through the injected LAB-007 `EnsemblePort` whose members
 * execute the disclosed deterministic synthetic response functions; the
 * benchmark's numbers are SIMULATED estimates (§22 — never ground truth)
 * that inform SELECTION only (§24 — never deployment evidence). The
 * `bench-additive-v1` uncertainty formulas are documented in
 * benchmark-support.ts (no invented sophistication).
 *
 * FAIRNESS (§22/cross-candidate): EVERY candidate — the declared set AND
 * the synthesized no-op baseline — is evaluated under the SAME
 * (world-model, seed, step) grid pinned by the declared policy + run
 * seeds; per-candidate condition cherry-picking is not expressible.
 *
 * RECORDS: versioned per (tenant, benchmark id), append-only (runBenchmark
 * is the ONLY write path — there is no update or delete method),
 * deep-frozen with clone-then-freeze ownership of caller inputs, and
 * digest-sealed (bit-for-bit immutability — `verifyBenchmarkRecordIntegrity`
 * recomputes the digest from the stored payload; divergence reports
 * `tampered`, a branch reachable only when the underlying store corrupts —
 * durable-adapter territory, disclosed).
 *
 * Ephemeral process-local scaffold (durable persistence is TL-owned).
 */

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: RobustBenchmarkError['error'], message: string): RobustBenchmarkError => ({
  error,
  message,
});

const isBlank = (value: string): boolean => value.trim().length === 0;

/** One world-model set entry resolved to its stored ensemble version. */
interface ResolvedWorld {
  readonly ref: MarketingBenchmarkInput['policy']['worldModelSet'][number];
  readonly ensemble: WorldModelEnsemble;
}

/** Options for {@link createInMemoryMarketingBenchmark}. */
export interface InMemoryMarketingBenchmarkOptions {
  /** The LAB-007 ensemble every world-model set entry resolves + evaluates through. */
  readonly ensemble: Pick<
    EnsemblePort,
    'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'
  >;
  /** Injectable clock for deterministic `benchmarkedAt`/`recordedAt` stamps. */
  readonly now?: () => Timestamp;
}

const CALIBRATION_DECLARATION = deepFreeze({
  status: 'pending-reality',
  provenance:
    'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten',
  predictionSurface: 'per-candidate expected reward + interval',
}) as RobustBenchmarkResult['calibration'];

export function createInMemoryMarketingBenchmark(
  options: InMemoryMarketingBenchmarkOptions,
): MarketingBenchmarkPort {
  const now = options.now ?? nowDefault;
  /** Append-only record chains: tenant → benchmark id → versions (oldest first). */
  const chains = new Map<TenantId, Map<RobustBenchmarkId, RobustBenchmarkRecord[]>>();

  /** READ view of one chain — never creates store entries (reads stay pure). */
  const chainOf = (scope: TenantScope, id: RobustBenchmarkId): readonly RobustBenchmarkRecord[] =>
    chains.get(scope.tenantId)?.get(id) ?? [];

  /** WRITE accessor — the only path that creates a chain (runBenchmark). */
  const chainForWrite = (scope: TenantScope, id: RobustBenchmarkId): RobustBenchmarkRecord[] => {
    const byId =
      chains.get(scope.tenantId) ?? new Map<RobustBenchmarkId, RobustBenchmarkRecord[]>();
    chains.set(scope.tenantId, byId);
    const chain = byId.get(id) ?? [];
    byId.set(id, chain);
    return chain;
  };

  // -------------------------------------------------------------------------
  // World-model set resolution (unresolvable refs fail closed)
  // -------------------------------------------------------------------------

  const resolveWorlds = async (
    input: MarketingBenchmarkInput,
  ): Promise<{ readonly error: RobustBenchmarkError } | { readonly worlds: readonly ResolvedWorld[] }> => {
    const worlds: ResolvedWorld[] = [];
    for (const ref of input.policy.worldModelSet) {
      const record = await options.ensemble.getEnsemble(
        input.scope,
        ref.ensembleId,
        ref.ensembleVersion,
      );
      if (record === null) {
        const latest = await options.ensemble.resolveLatestEnsemble(input.scope, ref.ensembleId);
        if (latest === null) {
          return {
            error: fail(
              'unknown-ensemble',
              `world-model set entry "${ref.label}": no ensemble ${ref.ensembleId} visible in this tenant scope`,
            ),
          };
        }
        return {
          error: fail(
            'ensemble-version-not-found',
            `world-model set entry "${ref.label}": ensemble ${ref.ensembleId} has no version ${ref.ensembleVersion} in this tenant scope (latest is ${latest.version})`,
          ),
        };
      }
      if (record.niche !== input.scenario.niche || record.platform !== input.scenario.platform) {
        return {
          error: fail(
            'scenario-ensemble-mismatch',
            `world-model set entry "${ref.label}": scenario (${input.scenario.niche}/${input.scenario.platform}) does not match ensemble ${ref.ensembleId} v${ref.ensembleVersion} (${record.niche}/${record.platform})`,
          ),
        };
      }
      if (record.members.length < 2) {
        return {
          error: fail(
            'invalid-input',
            `world-model set entry "${ref.label}": ensemble ${ref.ensembleId} v${ref.ensembleVersion} carries fewer than two members — evaluation fails closed`,
          ),
        };
      }
      worlds.push({ ref, ensemble: record });
    }
    return { worlds };
  };

  // -------------------------------------------------------------------------
  // Rollout (the SAME grid for every candidate — the fairness pin)
  // -------------------------------------------------------------------------

  const rolloutFor = async (
    input: MarketingBenchmarkInput,
    worlds: readonly ResolvedWorld[],
    candidate: BenchmarkCandidate,
  ): Promise<
    | { readonly error: RobustBenchmarkError }
    | { readonly rollouts: readonly WorldRollout[] }
  > => {
    const rollouts: WorldRollout[] = [];
    for (const world of worlds) {
      const predictions: EnsemblePrediction[] = [];
      for (const seed of input.seeds) {
        for (let step = 0; step < candidate.horizonSteps; step += 1) {
          const evaluationInput: EnsembleEvaluationInput = {
            scope: input.scope,
            ensembleId: world.ref.ensembleId,
            ensembleVersion: world.ref.ensembleVersion,
            scenario: input.scenario,
            candidate: candidate.action,
            seed,
            step,
          };
          const prediction = await options.ensemble.evaluateEnsemble(evaluationInput);
          if ('error' in prediction) {
            return {
              error: fail(
                'ensemble-evaluation-failed',
                `candidate "${candidate.key}" under world "${world.ref.label}" (seed ${seed}, step ${step}): [${prediction.error}] ${prediction.message}`,
              ),
            };
          }
          predictions.push(prediction);
        }
      }
      rollouts.push({ ref: world.ref, predictions });
    }
    return { rollouts };
  };

  // -------------------------------------------------------------------------
  // Ranking + comparison assembly (the declared deterministic tie-break)
  // — the pure ranker lives in benchmark-support.ts
  // -------------------------------------------------------------------------

  return {
    async runBenchmark(
      input: MarketingBenchmarkInput,
    ): Promise<RobustBenchmarkRecord | RobustBenchmarkError> {
      // ---- 1. structural validation (fail closed, named codes) ----
      if (
        input === null ||
        typeof input !== 'object' ||
        typeof input.benchmarkId !== 'string' ||
        isBlank(input.benchmarkId)
      ) {
        return fail('invalid-input', 'benchmarkId must be a non-empty string');
      }
      if (input.scenario === null || typeof input.scenario !== 'object') {
        return fail('invalid-input', 'scenario must be an object');
      }
      if (input.policy === null || typeof input.policy !== 'object') {
        return fail('invalid-input', 'policy must be an object');
      }
      if (
        typeof input.scenario.informationLag !== 'number' ||
        !Number.isFinite(input.scenario.informationLag) ||
        input.scenario.informationLag < 0
      ) {
        return fail('invalid-input', 'scenario.informationLag must be a finite number >= 0');
      }
      if (!Array.isArray(input.candidates)) {
        return fail(
          'invalid-input',
          'candidates must be an array (may be empty — the no-op baseline still runs)',
        );
      }
      const keys = new Set<string>();
      for (let index = 0; index < input.candidates.length; index += 1) {
        const candidate = input.candidates[index];
        const fault = validateBenchmarkCandidate(candidate, `candidates[${index}]`);
        if (fault !== null) {
          return fail(isNoopBaselineClaim(fault) ? 'caller-claimed-noop-baseline' : 'invalid-candidate', fault);
        }
        if (keys.has(candidate.key)) {
          return fail(
            'duplicate-candidate-key',
            `duplicate candidate key "${candidate.key}" (keys are unique within a run)`,
          );
        }
        keys.add(candidate.key);
      }
      const policyFault = validateRobustnessPolicy(input.policy);
      if (policyFault !== null) {
        return fail('invalid-input', policyFault);
      }
      if (
        !Array.isArray(input.seeds) ||
        input.seeds.length !== input.policy.seedBudget ||
        input.seeds.some((seed) => typeof seed !== 'number' || !Number.isFinite(seed)) ||
        new Set(input.seeds).size !== input.seeds.length
      ) {
        return fail(
          'seed-budget-mismatch',
          `seeds must be exactly ${input.policy.seedBudget} distinct finite numbers matching the declared policy seed budget (the fairness pin input)`,
        );
      }
      const specFault = validateRewardSpec(input.rewardSpec);
      if (specFault !== null) {
        return fail('invalid-input', specFault);
      }
      if (input.rewardSpec.version !== input.scenario.rewardVersion) {
        return fail(
          'reward-version-mismatch',
          `rewardSpec.version ${input.rewardSpec.version} does not match scenario.rewardVersion ${input.scenario.rewardVersion}`,
        );
      }

      // ---- 2. world-model set resolution ----
      const resolved = await resolveWorlds(input);
      if ('error' in resolved) {
        return resolved.error;
      }
      const worldPins: readonly BenchmarkWorldModelPin[] = resolved.worlds.map((world) => ({
        ensembleId: world.ref.ensembleId,
        ensembleVersion: world.ref.ensembleVersion,
        weightingPolicyId: world.ensemble.weightingPolicy.id,
        weightingPolicyVersion: world.ensemble.weightingPolicy.version,
        weightingKind: world.ensemble.weightingPolicy.kind,
        memberWorldModelVersions: world.ensemble.members.map((member) => member.worldModelVersion),
      }));

      // CLONE-THEN-FREEZE OWNERSHIP: from here on the run works on its OWN
      // copy of every caller-supplied array/object — the frozen record can
      // never freeze or corrupt data the caller still owns (the W4-B/W8-A
      // recurring defect class, prevented by construction).
      const seeds = Object.freeze([...input.seeds]);
      const sweepDimensions = Object.freeze([...input.policy.sweepDimensions]);
      const rewardSpec = input.rewardSpec;
      const policy = input.policy;

      // ---- 3. rollout + §22 evaluation per candidate (baseline FIRST-class) ----
      const all: BenchmarkCandidate[] = [
        noopBaselineCandidate(),
        ...input.candidates.map((candidate) => cloneDeep(candidate)),
      ];
      const entries: EvaluatedEntry[] = [];
      for (const candidate of all) {
        const rollout = await rolloutFor(input, resolved.worlds, candidate);
        if ('error' in rollout) {
          return rollout.error;
        }
        const evaluation = evaluateCandidateRobustness(
          candidate,
          rewardSpec,
          policy,
          seeds,
          rollout.rollouts,
        );
        if ('failure' in evaluation) {
          return fail(
            evaluation.failure,
            `candidate "${candidate.key}": reward term source "${evaluation.metricSource}" does not resolve in the predicted metric/delta domains (this benchmark is simulation-only; observed-domain terms are LAB-008 territory)`,
          );
        }
        entries.push({
          key: candidate.key,
          label: candidate.label ?? null,
          origin: candidate.source.origin,
          candidate,
          evaluation,
        });
      }

      // ---- 4. ranking + comparison + result assembly (frozen snapshot) ----
      const ranked = rankBenchmarkEntries(entries, worldPins, {
        scenario: input.scenario,
        rewardSpec,
        policy,
        seeds,
      });
      const noopRanked = ranked.find((entry) => entry.origin === 'no-op-baseline');
      if (noopRanked === undefined) {
        return fail('invalid-input', 'the synthesized no-op baseline is missing — unrepresentable');
      }
      const provenance: BenchmarkProvenance = {
        simulatorVersion: input.scenario.simulatorVersion,
        corpusVersion: input.scenario.corpusVersion,
        rewardSpecVersion: rewardSpec.version,
        policyId: policy.id,
        policyVersion: policy.version,
        seeds,
        sweepDimensions,
        worldModels: worldPins,
      };
      const result: RobustBenchmarkResult = {
        id: input.benchmarkId,
        tenantId: input.scope.tenantId,
        scenarioRef: input.scenario.id,
        ranked,
        comparison: {
          noopBaseline: noopRanked,
          declared: ranked.filter((entry) => entry.origin !== 'no-op-baseline'),
        },
        policy: cloneDeep(input.policy),
        seeds,
        fairness: {
          seeds,
          worldModelSet: cloneDeep(input.policy.worldModelSet),
          policyId: policy.id,
          policyVersion: policy.version,
          rewardSpecVersion: rewardSpec.version,
          statement:
            'every candidate in this benchmark was evaluated under the same seeds, world-model set, policy version and reward spec version — no per-candidate condition cherry-picking',
        },
        provenance,
        benchmarkedAt: now(),
        counterfactual: true,
        disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles',
        labOnly:
          'robust benchmark output informs selection only — it is NOT deployment evidence; the real-experiment boundary (§24) is the only path to reality-grade proof',
        calibration: CALIBRATION_DECLARATION,
      };

      // ---- 5. append the frozen, digest-sealed record (the only write path) ----
      const chain = chainForWrite(input.scope, input.benchmarkId);
      const version = chain.length + 1;
      const resultDigest = digestOf(result);
      const record: RobustBenchmarkRecord = deepFreeze({
        ...result,
        version: version as RobustBenchmarkRecord['version'],
        resultDigest,
        recordedAt: now(),
      });
      chain.push(record);
      return record;
    },

    async getBenchmarkRecord(
      scope: TenantScope,
      id: RobustBenchmarkId,
      version: number,
    ): Promise<RobustBenchmarkRecord | null> {
      const chain = chainOf(scope, id);
      return chain.find((record) => record.version === version) ?? null;
    },

    async resolveLatestBenchmarkRecord(
      scope: TenantScope,
      id: RobustBenchmarkId,
    ): Promise<RobustBenchmarkRecord | null> {
      const chain = chainOf(scope, id);
      return chain.length === 0 ? null : (chain[chain.length - 1] as RobustBenchmarkRecord);
    },

    async listBenchmarkRecordVersions(
      scope: TenantScope,
      id: RobustBenchmarkId,
    ): Promise<readonly RobustBenchmarkRecord[]> {
      return [...chainOf(scope, id)];
    },

    async verifyBenchmarkRecordIntegrity(
      scope: TenantScope,
      id: RobustBenchmarkId,
      version: number,
    ): Promise<BenchmarkIntegrityReport | null> {
      const chain = chainOf(scope, id);
      const record = chain.find((entry) => entry.version === version);
      if (record === undefined) {
        return null;
      }
      const payload: Record<string, unknown> = { ...record };
      delete payload.version;
      delete payload.resultDigest;
      delete payload.recordedAt;
      const recomputedDigest = digestOf(payload);
      return {
        benchmarkId: id,
        version,
        status: recomputedDigest === record.resultDigest ? 'intact' : 'tampered',
        recordedDigest: record.resultDigest,
        recomputedDigest,
      };
    },
  };
}

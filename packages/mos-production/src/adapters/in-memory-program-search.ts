/**
 * The in-memory production program search (LAB-016, §7).
 *
 * W8-B DISCLOSURE — THE FULL DOCUMENTED ALGORITHM (deterministic
 * hill-climb over the SIXTEEN §7 dimensions; no invented sophistication —
 * the W5-B generation discipline applied to program candidates):
 *
 * ```
 * seeds            = evaluationSeedsOf(seed, policy.seedCount)   (per policy)
 * no-op baseline   = SYNTHESIZED on every search (§7/lock rule 5 — the
 *                    empty-chain repost; compared against by every entry)
 * seed program     = synthesized from the vocabularies' first entries +
 *                    the input's declared frames (the generation root)
 * initial set      = [no-op baseline, seed program, ...handDesigned]   (ALL
 *                    evaluated, no dedup — §7 compares them however similar)
 * estimate(c)      = the documented synthetic action mapping evaluated
 *                    through the program evaluation seam over the seeds
 *                    (program-search-estimation.ts)
 * interval         = estimate ± (ε_ens + ε_seed)
 *                    ε_ens  = mean per-seed disagreement half-width
 *                    ε_seed = half the per-seed-estimate spread
 * EV of delay      = mean per-seed EV from the seam (§2 first-class
 *                    variable — LAB-015 carried; conservative interval)
 * generation loop  = mutants of the incumbent in FROZEN §7 dimension
 *                    order, deduplicated by sixteen-dimension
 *                    fingerprint, evaluated in order while the evaluation
 *                    budget allows; best improving mutant (improvement >
 *                    improvementTolerance) becomes incumbent
 * stop             = checked per generation, DECLARED precedence:
 *                    budget → plateau window → iteration cap
 * prune            = 'interval-dominance': upper(entry) < lower(FINAL
 *                    incumbent) marks the entry pruned (certainly worse
 *                    than the incumbent's worst case; stays ranked, never
 *                    a parent)
 * rank             = expected reward DESC → interval half-width ASC →
 *                    candidate key ASC → origin precedence → arrival
 *                    order; interval overlap with the rank-1 entry and
 *                    with the NO-OP BASELINE are DECLARED on every entry
 * ```
 *
 * The no-op baseline is NEVER a generation parent (the coarse no-op→
 * program jump is the seed program's job — documented design call); the
 * baseline is always evaluated and every entry declares its comparison
 * against it.
 *
 * OWNERSHIP: caller-supplied candidates are CLONED and only the
 * production-owned clones are frozen into the result — caller data is
 * never mutated or frozen in place (the W5-B discipline).
 */

import type { Timestamp } from "@mos/contracts";

import type {
  ProductionProgramSearchResult,
  ProductionProgramSearchResultId,
} from "../contracts/program-search-result.js";
import type {
  ProductionProgramSearchError,
  ProductionProgramSearchInput,
} from "../contracts/program-search.js";
import type { ProductionProgramSearchPort } from "../contracts/program-search-result.js";
import type { RankedCandidateProgram } from "../contracts/program-search-result.js";
import type { ProgramSearchProvenance } from "../contracts/program-search-result.js";
import type { ProgramSearchStopping } from "../contracts/program-search-result.js";
import type { ProgramCandidateOrigin } from "../contracts/program-candidate.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import type { ProgramFeatureFingerprint } from "../contracts/program-dimensions.js";
import { PROGRAM_SEARCH_DIMENSIONS } from "../contracts/program-dimensions.js";
import type { ProgramSearchDimension } from "../contracts/program-dimensions.js";
import type { ProgramTransformCatalogPort } from "../ports/program-transform-catalog.port.js";
import type { ProgramOrganizationSourcePort } from "../ports/program-organization-source.port.js";
import type { PawnTransformSourcePort } from "../ports/transform-source.port.js";
import type { ProgramEvaluationPort } from "../ports/program-evaluation.port.js";
import {
  composeProgramRequest,
  programRequestIdOf,
  stableTagOf,
} from "../domain/program-request-compose.js";
import { deepFreezeRecord } from "./registry-support.js";
import {
  programFeatureFingerprint,
  programFingerprintKeyOf,
  sourceReferenceSignatureOf,
} from "./program-fingerprint.js";
import {
  resolveProgramSearchContext,
  validateProgramSearchInput,
  validateProgramSearchPolicy,
} from "./program-search-validation.js";
import { validateDeclaredCandidate } from "./program-candidate-validation.js";
import { programMutationsOf } from "./program-mutations.js";
import {
  synthesizeNoopBaseline,
  synthesizeSeedProgram,
} from "./program-synthesis.js";
import {
  estimateProgramCandidate,
  evaluationSeedsOf,
} from "./program-search-estimation.js";
import type { ProgramCandidateEstimate } from "./program-search-estimation.js";
import type { ProgramSurfacePins } from "./program-search-estimation.js";

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (
  error: ProductionProgramSearchError["error"],
  message: string,
): ProductionProgramSearchError => ({ error, message });

const ORIGIN_RANK: Readonly<Record<ProgramCandidateOrigin, number>> = {
  "no-op-baseline": 0,
  "hand-designed": 1,
  generated: 2,
};

/** Options for {@link createInMemoryProgramSearch}. */
export interface InMemoryProgramSearchOptions {
  /** The promoted-transform vocabulary seam (LAB-011/012 listing). */
  readonly catalog: ProgramTransformCatalogPort;
  /** The organization descriptor seam (LAB-010-style listing). */
  readonly organizations: ProgramOrganizationSourcePort;
  /** The exact-version transform resolution seam (the W7-B seam). */
  readonly transforms: PawnTransformSourcePort;
  /** The program evaluation seam (LAB-007-style §22 uncertainty). */
  readonly evaluation: ProgramEvaluationPort;
  /** Injectable clock for deterministic `searchedAt` stamps. */
  readonly now?: () => Timestamp;
}

interface InternalEntry {
  readonly candidate: CandidateProgram;
  readonly fingerprint: ProgramFeatureFingerprint;
  readonly key: string;
  readonly parentFingerprint: ProgramFeatureFingerprint | null;
  readonly generationIndex: number | null;
  readonly origin: ProgramCandidateOrigin;
  readonly variedDimensions: readonly ProgramSearchDimension[];
  readonly estimate: ProgramCandidateEstimate;
  readonly arrivalIndex: number;
  pruned: boolean;
}

const halfWidthOf = (entry: InternalEntry): number =>
  (entry.estimate.evaluation.interval.upper - entry.estimate.evaluation.interval.lower) / 2;

const compareEntries = (a: InternalEntry, b: InternalEntry): number => {
  const rewardDelta =
    b.estimate.evaluation.expectedReward - a.estimate.evaluation.expectedReward;
  if (rewardDelta !== 0) return rewardDelta;
  const widthDelta = halfWidthOf(a) - halfWidthOf(b);
  if (widthDelta !== 0) return widthDelta;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  const originDelta = ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin];
  if (originDelta !== 0) return originDelta;
  return a.arrivalIndex - b.arrivalIndex;
};

// ---------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------

/** Creates the in-memory production program search (a disclosed double). */
export function createInMemoryProgramSearch(
  options: InMemoryProgramSearchOptions,
): ProductionProgramSearchPort {
  const now = options.now ?? nowDefault;
  return {
    async searchPrograms(
      input: ProductionProgramSearchInput,
    ): Promise<ProductionProgramSearchResult | ProductionProgramSearchError> {
      // ---- 1. declared policy + input validation ----
      const policyFailure = validateProgramSearchPolicy(input.policy);
      if (policyFailure !== null) return policyFailure;
      const inputFailure = validateProgramSearchInput(input);
      if (inputFailure !== null) return inputFailure;

      // ---- 2. seam-resolved context ----
      const context = await resolveProgramSearchContext(input, {
        catalog: options.catalog,
        organizations: options.organizations,
        transforms: options.transforms,
      });
      if ("error" in context) return context;

      // ---- 3. hand-designed candidates: fail-closed validation ----
      for (const declared of input.handDesigned ?? []) {
        const failure = await validateDeclaredCandidate(context, declared.candidate);
        if (failure !== null) return failure;
      }

      // ---- 4. budget floor: initials + at least ONE generated evaluation ----
      const initialCount = 2 + (input.handDesigned?.length ?? 0);
      const mandatedFloor = initialCount + 1;
      if (input.budget.maxCandidateEvaluations < mandatedFloor) {
        return fail(
          "budget-below-mandated-floor",
          `maxCandidateEvaluations ${input.budget.maxCandidateEvaluations} cannot cover the search mandate (${mandatedFloor} candidate evaluations = ${initialCount} initials + at least one generated candidate)`,
        );
      }

      // ---- 5. the initial set (no-op baseline ALWAYS first) ----
      const sourceSignature = sourceReferenceSignatureOf(input.sourceArtifactRefs);
      const evaluationSeeds = evaluationSeedsOf(input.seed, input.policy.seedCount);
      const entries: InternalEntry[] = [];
      const seenKeys = new Set<string>();
      const state: { pins: ProgramSurfacePins | null } = { pins: null };
      let consumed = 0;
      let seamConsumed = 0;
      let generatedEvaluated = 0;

      const recordInitial = async (
        candidate: CandidateProgram,
        origin: ProgramCandidateOrigin,
      ): Promise<ProductionProgramSearchError | null> => {
        const estimate = await estimateProgramCandidate(
          { evaluation: options.evaluation },
          context,
          candidate,
          evaluationSeeds,
        );
        if ("error" in estimate) return estimate;
        state.pins = state.pins ?? estimate.pins;
        consumed += 1;
        seamConsumed += estimate.evaluation.seamEvaluationsConsumed;
        const fingerprint = programFeatureFingerprint(candidate, sourceSignature);
        entries.push({
          candidate: deepFreezeRecord(cloneJson(candidate)),
          fingerprint,
          key: programFingerprintKeyOf(fingerprint),
          parentFingerprint: null,
          generationIndex: null,
          origin,
          variedDimensions: [...PROGRAM_SEARCH_DIMENSIONS],
          estimate,
          arrivalIndex: entries.length,
          pruned: false,
        });
        return null;
      };

      const noopBaseline = synthesizeNoopBaseline(context);
      let initialFailure = await recordInitial(noopBaseline, "no-op-baseline");
      if (initialFailure !== null) return initialFailure;
      const seedProgram = synthesizeSeedProgram(context);
      initialFailure = await recordInitial(seedProgram, "generated");
      if (initialFailure !== null) return initialFailure;
      for (const declared of input.handDesigned ?? []) {
        const failure = await recordInitial(declared.candidate, "hand-designed");
        if (failure !== null) return failure;
      }
      for (const entry of entries) seenKeys.add(entry.key);
      // The incumbent is the best NON-BASELINE initial: the no-op baseline
      // is NEVER a generation parent (documented design call — the coarse
      // no-op→program jump is the seed program's job). The initial set
      // guarantees at least one non-baseline entry (the seed program).
      const programEntries = entries.filter(
        (entry) => entry.origin !== "no-op-baseline",
      );
      let incumbent = programEntries.reduce((best, entry) =>
        compareEntries(entry, best) < 0 ? entry : best,
      );

      // ---- 6. the generation loop (frozen §7 dimension order) ----
      let plateau = 0;
      let generationsExecuted = 0;
      let stopping: ProgramSearchStopping = {
        reason: "iteration-cap-reached",
        detail: `the iteration cap (${input.budget.maxIterations}) bounded the search`,
        generationsExecuted: 0,
      };
      for (
        let generation = 1;
        generation <= input.budget.maxIterations;
        generation += 1
      ) {
        if (consumed >= input.budget.maxCandidateEvaluations) {
          stopping = {
            reason: "budget-exhausted",
            detail: `the evaluation budget (${input.budget.maxCandidateEvaluations} candidate evaluations) bounded the search`,
            generationsExecuted,
          };
          break;
        }
        generationsExecuted = generation;
        const mutations = programMutationsOf(
          incumbent.candidate,
          context,
          generation,
        );
        let bestImproving: InternalEntry | null = null;
        for (const mutation of mutations) {
          if (consumed >= input.budget.maxCandidateEvaluations) break;
          const fingerprint = mutation.fingerprint;
          const key = mutation.key;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const estimate = await estimateProgramCandidate(
            { evaluation: options.evaluation },
            context,
            mutation.candidate,
            evaluationSeeds,
          );
          if ("error" in estimate) return estimate;
          state.pins = state.pins ?? estimate.pins;
          consumed += 1;
          seamConsumed += estimate.evaluation.seamEvaluationsConsumed;
          generatedEvaluated += 1;
          const entry: InternalEntry = {
            candidate: deepFreezeRecord(cloneJson(mutation.candidate)),
            fingerprint,
            key,
            parentFingerprint: incumbent.fingerprint,
            generationIndex: generation,
            origin: "generated",
            // The honest provenance: EXACTLY the dimensions whose
            // fingerprints differ from the parent (the operator's primary
            // dimension plus any coherence dimensions rebuilt with it).
            variedDimensions: mutation.variedDimensions,
            estimate,
            arrivalIndex: entries.length,
            pruned: false,
          };
          entries.push(entry);
          const improvement =
            estimate.evaluation.expectedReward -
            incumbent.estimate.evaluation.expectedReward;
          if (
            improvement > input.policy.improvementTolerance &&
            (bestImproving === null || compareEntries(entry, bestImproving) < 0)
          ) {
            bestImproving = entry;
          }
        }
        if (bestImproving !== null) {
          incumbent = bestImproving;
          plateau = 0;
        } else {
          plateau += 1;
        }
        if (consumed >= input.budget.maxCandidateEvaluations) {
          stopping = {
            reason: "budget-exhausted",
            detail: `the evaluation budget (${input.budget.maxCandidateEvaluations} candidate evaluations) bounded the search`,
            generationsExecuted,
          };
          break;
        }
        if (plateau >= input.policy.plateauWindow) {
          stopping = {
            reason: "plateau-detected",
            detail: `${input.policy.plateauWindow} consecutive non-improving generations (improvement tolerance ${input.policy.improvementTolerance})`,
            generationsExecuted,
          };
          break;
        }
        if (generation === input.budget.maxIterations) {
          stopping = {
            reason: "iteration-cap-reached",
            detail: `the iteration cap (${input.budget.maxIterations}) bounded the search`,
            generationsExecuted,
          };
        }
      }

      // ---- 7. pruning pass (interval-dominance vs the FINAL incumbent) ----
      if (input.policy.pruning === "interval-dominance") {
        for (const entry of entries) {
          if (entry === incumbent) continue;
          if (entry.estimate.evaluation.interval.upper < incumbent.estimate.evaluation.interval.lower) {
            entry.pruned = true;
          }
        }
      }

      // ---- 8. ranking + declared overlaps + baseline comparisons ----
      const surfacePins = state.pins;
      if (surfacePins === null) {
        return fail("evaluation-failed", "the search produced no evaluations (unreachable: the initial set is non-empty)");
      }
      const ordered = [...entries].sort(compareEntries);
      const baselineEntry =
        entries.find((entry) => entry.origin === "no-op-baseline") ?? null;
      if (baselineEntry === null) {
        return fail("evaluation-failed", "unreachable: the no-op baseline is always evaluated first");
      }
      const leader = ordered[0];
      if (leader === undefined) {
        return fail("evaluation-failed", "unreachable: the ranked set is non-empty");
      }
      const searchedAt = now();
      const ranked: RankedCandidateProgram[] = ordered.map((entry, index) => {
        const candidateKey =
          entry.origin === "no-op-baseline" ? "no-op-repost" : stableTagOf(entry.key);
        const provenance: ProgramSearchProvenance = {
          origin: entry.origin,
          variedDimensions: [...entry.variedDimensions],
          fingerprint: entry.fingerprint,
          parentFingerprint: entry.parentFingerprint,
          generationIndex: entry.generationIndex,
          policyVersion: input.policy.version,
          seed: input.seed,
          evaluationSeeds: [...evaluationSeeds],
          ensembleId: surfacePins.ensembleId,
          ensembleVersion: surfacePins.ensembleVersion,
          simulatorVersion: surfacePins.simulatorVersion,
          rewardSpecVersion: surfacePins.rewardSpecVersion,
          pruned: entry.pruned,
          pruningRule: input.policy.pruning,
          searchedAt,
        };
        const overlaps = (
          a: InternalEntry["estimate"]["evaluation"]["interval"],
          b: InternalEntry["estimate"]["evaluation"]["interval"],
        ): boolean => a.lower <= b.upper && b.lower <= a.upper;
        const leaderInterval = leader.estimate.evaluation.interval;
        const ownInterval = entry.estimate.evaluation.interval;
        const baselineInterval = baselineEntry.estimate.evaluation.interval;
        const baselineReward = baselineEntry.estimate.evaluation.expectedReward;
        return {
          rank: index + 1,
          candidate: entry.candidate,
          request: composeProgramRequest(
            input,
            entry.candidate,
            programRequestIdOf(candidateKey),
          ),
          evaluation: entry.estimate.evaluation,
          provenance,
          comparisonToBaseline: {
            baselineExpectedReward: baselineReward,
            expectedRewardDelta:
              entry.estimate.evaluation.expectedReward - baselineReward,
            intervalOverlapWithBaseline: {
              overlaps: overlaps(ownInterval, baselineInterval),
              note: `interval ${ownInterval.lower.toFixed(4)}..${ownInterval.upper.toFixed(4)} vs no-op baseline ${baselineInterval.lower.toFixed(4)}..${baselineInterval.upper.toFixed(4)}`,
            },
          },
          intervalOverlapWithLeader:
            entry === leader
              ? null
              : {
                  overlaps: overlaps(ownInterval, leaderInterval),
                  note: `interval ${ownInterval.lower.toFixed(4)}..${ownInterval.upper.toFixed(4)} vs rank-1 ${leaderInterval.lower.toFixed(4)}..${leaderInterval.upper.toFixed(4)}`,
                },
        };
      });
      const baselineRanked =
        ranked.find((entry) => entry.candidate.isNoopBaseline) ?? null;
      if (baselineRanked === null) {
        return fail("evaluation-failed", "unreachable: the no-op baseline is always ranked");
      }
      const resultId = `program-search:${stableTagOf(
        `${input.missionRef as string}:${input.seed}:${input.policy.version}:${sourceSignature}:${input.objective}`,
      )}` as ProductionProgramSearchResultId;
      return deepFreezeRecord({
        id: resultId,
        tenantId: input.scope.tenantId,
        missionRef: input.missionRef,
        ranked,
        noopBaseline: baselineRanked,
        budget: {
          maxCandidateEvaluations: input.budget.maxCandidateEvaluations,
          evaluationsConsumed: consumed,
          generatedEvaluated,
          seamEvaluationsConsumed: seamConsumed,
        },
        stopping,
        policy: cloneJson(input.policy),
        seed: input.seed,
        counterfactual: true as const,
        disclosure: "program-search-over-disclosed-synthetic-evaluation" as const,
        labOnly:
          "ranked lab-labeled candidate programs only — never a deployment decision; the real-experiment boundary (§24) is untouched" as const,
      });
    },
  };
}

/** Plain-data deep clone (JSON trees only — the ownership discipline). */
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

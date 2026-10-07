import type { Timestamp } from '@mos/contracts';
import type { EnsemblePort, WorldModelEnsemble } from '../contracts/ensemble.js';
import type {
  OrganizationCandidateEvaluation,
  OrganizationSearchError,
  OrganizationSearchInput,
  OrganizationSearchPort,
  OrganizationSearchProvenance,
  OrganizationSearchResult,
  OrganizationSearchResultId,
  OrganizationSearchStopReason,
  RankedOrganizationCandidate,
} from '../contracts/organization-search.js';
import type {
  OrganizationCandidateOrigin,
  OrganizationFeatureFingerprint,
  OrganizationSearchDimension,
  SearchedOrganizationCandidate,
} from '../contracts/organization-features.js';
import { ORGANIZATION_SEARCH_DIMENSIONS } from '../contracts/organization-features.js';
import { deepFreeze, predictionId } from './parametric-support.js';
import {
  organizationCandidateFaults,
  organizationFeatureFingerprint,
  variedDimensionsBetween,
} from './organization-features.js';
import { organizationMutationsOf } from './organization-mutations.js';
import { organizationEffectiveHorizon } from './organization-simulation-mapping.js';
import {
  collectInitialCandidates,
} from './organization-search-validation.js';
import {
  estimateOrganizationCandidate,
  evaluationSeedsOf,
} from './organization-search-estimation.js';

/**
 * The in-memory agent organization search (LAB-010).
 *
 * W5-B DISCLOSURE — THE FULL DOCUMENTED ALGORITHM (deterministic hill-climb
 * over the twelve §23 dimensions; no invented sophistication):
 *
 * ```
 * seeds            = [mix(seed, 101·(i+1)) for i in 0..seedCount)   (per policy)
 * initial set      = [baseline, handDesigned, ...additional]        (slots fix
 *                    the origin; ALL evaluated, no dedup — the §23 mandate
 *                    compares them however similar)
 * estimate(c)      = mean over (seed, step) of R(ensembleEvaluate(action(c)))
 *                    where action(c) is the documented synthetic mapping
 *                    (organization-simulation-mapping.ts) and the horizon is
 *                    capped by the org's own stopping policy
 * interval         = estimate ± (ε_ens + ε_seed)
 *                    ε_ens  = half the member-reward spread
 *                    ε_seed = half the per-seed-average spread
 * generation loop  = mutants of the incumbent in FROZEN dimension order,
 *                    each re-validated + deduplicated by twelve-dimension
 *                    fingerprint, evaluated in order while the member-step
 *                    budget allows; best improving mutant (comparator below,
 *                    improvement > improvementTolerance) becomes incumbent
 * stop             = checked per generation, DECLARED precedence:
 *                    budget → plateau window → generation cap
 * prune            = 'interval-dominance': upper(entry) < lower(FINAL
 *                    incumbent) marks the entry pruned (certainly worse than
 *                    the incumbent's worst case; stays ranked, never a parent)
 * rank             = expected reward DESC → interval width ASC →
 *                    candidate key ASC → origin precedence → arrival order;
 *                    interval overlap with the rank-1 entry is DECLARED on
 *                    every other entry (never hidden)
 * ```
 *
 * The comparison mandate is enforced THREE ways: structurally required
 * input slots (baseline + hand-designed), a fail-closed single-agent
 * baseline check, and a structurally required three-way `comparison` block
 * on the result (a search that cannot produce a generated candidate under
 * the declared budget fails closed — `budget-below-mandated-floor` /
 * `comparison-mandate-violated`).
 *
 * OWNERSHIP: caller-supplied candidates are CLONED (validation module) and
 * only the lab-owned clones are frozen into the result — caller data is
 * never mutated or frozen in place.
 */

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: OrganizationSearchError['error'], message: string): OrganizationSearchError => ({
  error,
  message,
});

const ORIGIN_RANK: Readonly<Record<OrganizationCandidateOrigin, number>> = {
  'generalist-single-agent-baseline': 0,
  'hand-designed': 1,
  composed: 2,
  generated: 3,
};

/** Options for {@link createInMemoryOrganizationSearch}. */
export interface InMemoryOrganizationSearchOptions {
  /** The LAB-007 ensemble (evaluation + version reads). */
  readonly ensemble: Pick<
    EnsemblePort,
    'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'
  >;
  /** Injectable clock for deterministic `searchedAt` stamps. */
  readonly now?: () => Timestamp;
}

interface InternalEntry {
  readonly candidate: SearchedOrganizationCandidate;
  readonly fingerprint: OrganizationFeatureFingerprint;
  readonly parentFingerprint: OrganizationFeatureFingerprint | null;
  readonly generationIndex: number | null;
  readonly evaluation: OrganizationCandidateEvaluation;
  readonly key: string;
  readonly arrivalIndex: number;
}

const fingerprintKeyOf = (fingerprint: OrganizationFeatureFingerprint): string =>
  ORGANIZATION_SEARCH_DIMENSIONS.map((dimension) => fingerprint[dimension]).join('||');

export function createInMemoryOrganizationSearch(
  options: InMemoryOrganizationSearchOptions,
): OrganizationSearchPort {
  const now = options.now ?? nowDefault;

  return {
    async searchOrganizations(
      input: OrganizationSearchInput,
    ): Promise<OrganizationSearchResult | OrganizationSearchError> {
      // ---- 1. structural validation + lab-owned candidate copies ----
      const collected = collectInitialCandidates(input);
      if ('error' in collected) {
        return collected.error;
      }
      const owned = [...collected.candidates];

      // ---- 2. ensemble existence + version + scenario match ----
      const ensembleRecord: WorldModelEnsemble | null = await options.ensemble.getEnsemble(
        input.scope,
        input.ensembleId,
        input.ensembleVersion,
      );
      if (ensembleRecord === null) {
        const latest = await options.ensemble.resolveLatestEnsemble(input.scope, input.ensembleId);
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
          'scenario-ensemble-mismatch',
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

      // ---- 4. budget floor: initials + at least ONE generated evaluation ----
      const memberCount = ensembleRecord.members.length;
      const worstCaseEvaluationSteps =
        input.policy.seedCount * input.policy.horizonSteps * memberCount;
      const mandatedFloor = (owned.length + 1) * worstCaseEvaluationSteps;
      if (input.policy.maxMemberSteps < mandatedFloor) {
        return fail(
          'budget-below-mandated-floor',
          `maxMemberSteps ${input.policy.maxMemberSteps} cannot cover the §23 comparison mandate (${mandatedFloor} member steps = ${owned.length + 1} evaluations × ${input.policy.seedCount} seeds × ${input.policy.horizonSteps} steps × ${memberCount} members)`,
        );
      }

      // ---- 5. evaluate the initial candidates (the mandate compares them all) ----
      const entries: InternalEntry[] = [];
      const evaluatedFingerprints = new Set<string>();
      let consumed = 0;
      const recordEntry = (
        candidate: SearchedOrganizationCandidate,
        evaluation: InternalEntry['evaluation'],
        parentFingerprint: OrganizationFeatureFingerprint | null,
        generationIndex: number | null,
      ): InternalEntry => {
        const fingerprint = organizationFeatureFingerprint(candidate);
        evaluatedFingerprints.add(fingerprintKeyOf(fingerprint));
        const entry: InternalEntry = {
          candidate,
          fingerprint,
          parentFingerprint,
          generationIndex,
          evaluation,
          key: `${candidate.organization.id}@${candidate.organization.version}`,
          arrivalIndex: entries.length,
        };
        entries.push(entry);
        consumed += evaluation.simulatedMemberSteps;
        return entry;
      };
      for (const candidate of owned) {
        const evaluation = await estimateOrganizationCandidate(
          { ensemble: options.ensemble, now },
          input,
          ensembleRecord,
          candidate,
        );
        if ('error' in evaluation) {
          return evaluation;
        }
        recordEntry(candidate, evaluation, null, null);
      }

      // ---- 6. deterministic hill-climb generation loop ----
      const compare = (a: InternalEntry, b: InternalEntry): number => {
        if (a.evaluation.expectedReward !== b.evaluation.expectedReward) {
          return b.evaluation.expectedReward - a.evaluation.expectedReward;
        }
        const widthA = a.evaluation.interval.upper - a.evaluation.interval.lower;
        const widthB = b.evaluation.interval.upper - b.evaluation.interval.lower;
        if (widthA !== widthB) {
          return widthA - widthB;
        }
        if (a.key !== b.key) {
          return a.key < b.key ? -1 : 1;
        }
        if (ORIGIN_RANK[a.candidate.origin] !== ORIGIN_RANK[b.candidate.origin]) {
          return ORIGIN_RANK[a.candidate.origin] - ORIGIN_RANK[b.candidate.origin];
        }
        return a.arrivalIndex - b.arrivalIndex;
      };
      const bestOf = (list: readonly InternalEntry[]): InternalEntry =>
        list.reduce((best, entry) => (compare(entry, best) < 0 ? entry : best));

      let incumbent = bestOf(entries);
      let plateauStreak = 0;
      let generationsExecuted = 0;
      let stopReason: OrganizationSearchStopReason = 'generation-cap-reached';
      let stoppingDetail = '';

      for (let generation = 1; generation <= input.policy.maxGenerations; generation += 1) {
        if (plateauStreak >= input.policy.plateauWindow) {
          stopReason = 'plateau-detected';
          stoppingDetail = `${plateauStreak} consecutive generation(s) without an improvement above improvementTolerance ${input.policy.improvementTolerance}`;
          break;
        }
        const mutations = organizationMutationsOf(incumbent.candidate, input.policy, generation);
        const evaluatedThisGeneration: InternalEntry[] = [];
        let budgetExhausted = false;
        for (const mutation of mutations) {
          const faults = organizationCandidateFaults(mutation.candidate);
          if (faults.length > 0) {
            return fail(
              'invalid-candidate-organization',
              `generated candidate ${mutation.candidate.organization.id} (${mutation.dimension} move ${mutation.moveIndex}) is structurally invalid: ${faults.map((f) => `${f.code}: ${f.detail}`).join('; ')}`,
            );
          }
          const fingerprint = organizationFeatureFingerprint(mutation.candidate);
          if (evaluatedFingerprints.has(fingerprintKeyOf(fingerprint))) {
            continue; // duplicate point in the twelve-dimension search space
          }
          const cost =
            input.policy.seedCount *
            organizationEffectiveHorizon(mutation.candidate, input.policy) *
            memberCount;
          if (consumed + cost > input.policy.maxMemberSteps) {
            budgetExhausted = true;
            break;
          }
          const evaluation = await estimateOrganizationCandidate(
            { ensemble: options.ensemble, now },
            input,
            ensembleRecord,
            mutation.candidate,
          );
          if ('error' in evaluation) {
            return evaluation;
          }
          evaluatedThisGeneration.push(
            recordEntry(mutation.candidate, evaluation, incumbent.fingerprint, generation),
          );
        }
        if (evaluatedThisGeneration.length > 0) {
          const bestMutant = bestOf(evaluatedThisGeneration);
          const improvement =
            bestMutant.evaluation.expectedReward - incumbent.evaluation.expectedReward;
          if (improvement > input.policy.improvementTolerance) {
            incumbent = bestMutant;
            plateauStreak = 0;
          } else {
            plateauStreak += 1;
          }
        } else {
          plateauStreak += 1; // unaffordable or fully-deduplicated neighborhood
        }
        generationsExecuted += 1;
        if (budgetExhausted) {
          stopReason = 'budget-exhausted';
          stoppingDetail = `member-step budget ${input.policy.maxMemberSteps} exhausted after ${generationsExecuted} generation(s) (${consumed} member steps consumed)`;
          break;
        }
      }
      if (stoppingDetail === '') {
        stoppingDetail = `generation cap ${input.policy.maxGenerations} reached`;
      }

      // ---- 7. the comparison mandate guard (fail-closed) ----
      const generatedEntries = entries.filter((entry) => entry.candidate.origin === 'generated');
      if (generatedEntries.length === 0) {
        return fail(
          'comparison-mandate-violated',
          'the search produced no generated organization under the declared budget — §23 requires generated organizations in every comparison',
        );
      }

      // ---- 8. ranking (deterministic comparator; overlap declared) ----
      const incumbentLower = incumbent.evaluation.interval.lower;
      const pruningActive = input.policy.pruning === 'interval-dominance';
      const ordered = [...entries].sort(compare);
      const leader = ordered[0] as InternalEntry;
      const ranked: RankedOrganizationCandidate[] = ordered.map((entry, index) => {
        const varied: readonly OrganizationSearchDimension[] =
          entry.candidate.origin === 'generated' && entry.parentFingerprint !== null
            ? variedDimensionsBetween(entry.parentFingerprint, entry.fingerprint)
            : ORGANIZATION_SEARCH_DIMENSIONS;
        const provenance: OrganizationSearchProvenance = {
          origin: entry.candidate.origin,
          simulatorVersion: input.scenario.simulatorVersion,
          ensembleId: input.ensembleId,
          ensembleVersion: input.ensembleVersion,
          memberWorldModelVersions: ensembleRecord.members.map((member) => member.worldModelVersion),
          rewardSpecVersion: input.rewardSpec.version,
          seed: input.seed,
          evaluationSeeds: evaluationSeedsOf(input.seed, input.policy.seedCount),
          horizonSteps: input.policy.horizonSteps,
          fingerprint: entry.fingerprint,
          variedDimensions: varied,
          parentFingerprint: entry.parentFingerprint,
          generationIndex: entry.generationIndex,
          pruned: pruningActive && entry.evaluation.interval.upper < incumbentLower,
          pruningRule: input.policy.pruning,
          searchedAt: now(),
        };
        const overlaps =
          index === 0
            ? null
            : {
                overlaps:
                  entry.evaluation.interval.lower <= leader.evaluation.interval.upper &&
                  leader.evaluation.interval.lower <= entry.evaluation.interval.upper,
                note: 'interval overlap with the rank-1 candidate is declared (§22): overlapping intervals mean the order between these candidates is not uncertainty-significant',
              };
        return deepFreeze({
          rank: index + 1,
          candidate: entry.candidate,
          evaluation: entry.evaluation,
          provenance,
          intervalOverlapWithLeader: overlaps,
        } satisfies RankedOrganizationCandidate);
      });

      const comparison = deepFreeze({
        baseline: ranked.find(
          (entry) => entry.candidate.origin === 'generalist-single-agent-baseline',
        ) as RankedOrganizationCandidate,
        handDesigned: ranked.find(
          (entry) => entry.candidate.origin === 'hand-designed',
        ) as RankedOrganizationCandidate,
        generated: ranked.filter((entry) => entry.candidate.origin === 'generated'),
      });

      const result: OrganizationSearchResult = deepFreeze({
        id: predictionId('orgsearch', [
          input.scope.tenantId,
          input.ensembleId,
          input.ensembleVersion,
          input.scenario.id,
          input.rewardSpec.version,
          input.seed,
          entries.length,
        ]) as OrganizationSearchResultId,
        tenantId: input.scope.tenantId,
        ranked,
        comparison,
        budget: {
          maxMemberSteps: input.policy.maxMemberSteps,
          consumedMemberSteps: consumed,
          evaluationsExecuted: entries.length,
          generatedEvaluated: generatedEntries.length,
        },
        stopping: {
          reason: stopReason,
          detail: stoppingDetail,
          generationsExecuted,
        },
        counterfactual: true,
        disclosure: 'organization-search-over-disclosed-synthetic-simulation',
        labOnly:
          'ranked lab candidates only — never a deployment decision; the real-experiment boundary (§24) is untouched',
      });
      return result;
    },
  };
}

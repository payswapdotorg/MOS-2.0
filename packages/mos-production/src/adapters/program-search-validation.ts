/**
 * INTERNAL input validation + resolved search context for the production
 * program search (LAB-016) — NOT exported from the package index.
 *
 * Fail-closed validation of the declared input, policy and hand-designed
 * candidates, plus the RESOLVED context the search loop mutates against:
 * the chain-eligible promoted-transform vocabulary (catalog seam, no-op
 * kind filtered — the no-op path is the EMPTY-chain baseline, never a
 * chain step), the organization descriptor listing (organization-source
 * seam, tenant-scoped), and the exact-version transform resolution
 * (the W7-B transform-source seam) used to validate cited chain steps
 * and read their capability requirements.
 */

import type { Budget, CapabilityRequirement, Timestamp } from "@mos/contracts";

import type { ResolvedPawnTransform } from "../ports/transform-source.port.js";
import type { PawnTransformSourcePort } from "../ports/transform-source.port.js";
import type { ProgramOrganizationDescriptor } from "../ports/program-organization-source.port.js";
import type { ProgramOrganizationSourcePort } from "../ports/program-organization-source.port.js";
import type { ProgramTransformCatalogPort } from "../ports/program-transform-catalog.port.js";
import type { ProductionProgramSearchError } from "../contracts/program-search.js";
import type { ProductionProgramSearchInput } from "../contracts/program-search.js";
import type { ProductionProgramSearchPolicy } from "../contracts/program-search.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import { TRANSFORM_PAWN_BODIES } from "../bodies/transform-pawn-bodies.js";

const fail = (
  error: ProductionProgramSearchError["error"],
  message: string,
): ProductionProgramSearchError => ({ error, message });

const isBlank = (value: string): boolean => value.trim().length === 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

/** The pawn kinds whose execution path is model-flavored (W7-B bodies). */
const LLM_FLAVORED_PAWN_KINDS: readonly string[] = TRANSFORM_PAWN_BODIES
  .map((body) => body.role)
  .filter((role) => role.modelFlavor === "llm-flavored")
  .map((role) => role.pawnKind as string);

// ---------------------------------------------------------------------------
// Policy validation
// ---------------------------------------------------------------------------

/** Validates the declared search policy (fail-closed, named checks). */
export function validateProgramSearchPolicy(
  policy: ProductionProgramSearchPolicy,
): ProductionProgramSearchError | null {
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    return fail("invalid-policy", "policy.version must be an integer >= 1");
  }
  if (!Number.isInteger(policy.maxChainSteps) || policy.maxChainSteps < 1) {
    return fail("invalid-policy", "policy.maxChainSteps must be an integer >= 1");
  }
  if (
    policy.parameterPresetVocabulary.length === 0 ||
    !unique(policy.parameterPresetVocabulary) ||
    policy.parameterPresetVocabulary.some(isBlank)
  ) {
    return fail("invalid-policy", "policy.parameterPresetVocabulary must be non-empty, unique, non-blank");
  }
  if (
    policy.modalityVocabulary.length === 0 ||
    !unique(policy.modalityVocabulary)
  ) {
    return fail("invalid-policy", "policy.modalityVocabulary must be non-empty and unique");
  }
  if (policy.modelVocabulary.length === 0) {
    return fail("invalid-policy", "policy.modelVocabulary must be non-empty (declared DATA refs — the single-boundary vocabulary)");
  }
  if (policy.engineVocabulary.length === 0) {
    return fail("invalid-policy", "policy.engineVocabulary must be non-empty (registry vocabulary, exact versions)");
  }
  const ladderAscending = (ladder: readonly number[]): boolean => {
    if (ladder.length === 0) return false;
    let previous = ladder[0];
    for (const value of ladder.slice(1)) {
      if (previous === undefined || value === undefined || value <= previous) {
        return false;
      }
      previous = value;
    }
    return true;
  };
  if (
    !ladderAscending(policy.qualityFloorLadder) ||
    policy.qualityFloorLadder.some((v) => v < 0 || v > 1)
  ) {
    return fail("invalid-policy", "policy.qualityFloorLadder must be non-empty, ascending, values in [0, 1]");
  }
  if (!isFiniteNumber(policy.budgetScaleFactor) || policy.budgetScaleFactor <= 1) {
    return fail("invalid-policy", "policy.budgetScaleFactor must be a finite number > 1");
  }
  if (!ladderAscending(policy.expectedDurationLadderMs)) {
    return fail("invalid-policy", "policy.expectedDurationLadderMs must be non-empty and ascending");
  }
  if (!ladderAscending(policy.waitHorizonLadderMs)) {
    return fail("invalid-policy", "policy.waitHorizonLadderMs must be non-empty and ascending");
  }
  if (!Number.isInteger(policy.maxRetriesCap) || policy.maxRetriesCap < 1) {
    return fail("invalid-policy", "policy.maxRetriesCap must be an integer >= 1");
  }
  if (!Number.isInteger(policy.seedCount) || policy.seedCount < 2) {
    return fail("invalid-policy", "policy.seedCount must be an integer >= 2 (seed robustness requires two)");
  }
  if (!Number.isInteger(policy.plateauWindow) || policy.plateauWindow < 1) {
    return fail("invalid-policy", "policy.plateauWindow must be an integer >= 1");
  }
  if (!isFiniteNumber(policy.improvementTolerance) || policy.improvementTolerance < 0) {
    return fail("invalid-policy", "policy.improvementTolerance must be a finite number >= 0");
  }
  if (policy.pruning !== "none" && policy.pruning !== "interval-dominance") {
    return fail("invalid-policy", "policy.pruning must be 'none' or 'interval-dominance'");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const validBudget = (budget: Budget): boolean =>
  isFiniteNumber(budget.maxCost.amount) &&
  budget.maxCost.amount >= 0 &&
  !isBlank(budget.maxCost.currency) &&
  isFiniteNumber(budget.maxDurationMs) &&
  budget.maxDurationMs >= 0;

/** Validates the declared search input (fail-closed, named checks). */
export function validateProgramSearchInput(
  input: ProductionProgramSearchInput,
): ProductionProgramSearchError | null {
  if (isBlank(input.objective)) {
    return fail("invalid-input", "input.objective must be a non-blank statement");
  }
  if (input.sourceArtifactRefs.length === 0) {
    return fail("invalid-input", "input.sourceArtifactRefs must be non-empty (the GIVEN §7 source/reference dimension)");
  }
  if (input.studioFormatVocabulary.length === 0) {
    return fail("invalid-input", "input.studioFormatVocabulary must be non-empty");
  }
  if (!unique(input.studioFormatVocabulary.map((f) => f as string))) {
    return fail("invalid-input", "input.studioFormatVocabulary must be unique");
  }
  if (!unique(input.humanTaskVocabulary.map((t) => t as string))) {
    return fail("invalid-input", "input.humanTaskVocabulary must be unique");
  }
  const d = input.delayExpectation;
  if (
    !isFiniteNumber(d.expectedIncrementalValue) ||
    !isFiniteNumber(d.estimatedWaitMs) ||
    d.estimatedWaitMs < 0 ||
    !isFiniteNumber(d.delayCost) ||
    d.delayCost < 0 ||
    !isFiniteNumber(d.acquisitionCost) ||
    d.acquisitionCost < 0 ||
    !isFiniteNumber(d.successProbability) ||
    d.successProbability < 0 ||
    d.successProbability > 1 ||
    !isFiniteNumber(d.qualityImpact)
  ) {
    return fail("invalid-input", "input.delayExpectation terms must be finite (estimatedWaitMs/delayCost/acquisitionCost >= 0; successProbability in [0,1])");
  }
  if (
    d.provenance.kind === "declared-assumption" &&
    isBlank(d.provenance.note)
  ) {
    return fail("invalid-input", "declared-assumption delay provenance must carry a non-blank note (estimates are never invented)");
  }
  if (
    d.provenance.kind === "delay-analysis" &&
    (isBlank(d.provenance.analysisId) ||
      !Number.isInteger(d.provenance.analysisVersion) ||
      d.provenance.analysisVersion < 1)
  ) {
    return fail("invalid-input", "delay-analysis provenance must cite a non-blank analysisId and an integer analysisVersion >= 1");
  }
  if (!validBudget(input.baseBudget)) {
    return fail("invalid-input", "input.baseBudget must be a valid budget (finite non-negative amount/currency/duration)");
  }
  if (input.substitutionPreference.length === 0) {
    return fail("invalid-input", "input.substitutionPreference must be non-empty (the §18 escape vocabulary, ordered)");
  }
  if (!unique(input.substitutionPreference)) {
    return fail("invalid-input", "input.substitutionPreference must be unique");
  }
  if (Number.isNaN(Date.parse(input.deadlineAnchor))) {
    return fail("invalid-input", "input.deadlineAnchor must be an ISO-8601 timestamp");
  }
  if (!Number.isInteger(input.seed)) {
    return fail("invalid-input", "input.seed is required (integer)");
  }
  if (
    !Number.isInteger(input.budget.maxCandidateEvaluations) ||
    input.budget.maxCandidateEvaluations < 1 ||
    !Number.isInteger(input.budget.maxIterations) ||
    input.budget.maxIterations < 1
  ) {
    return fail("invalid-input", "input.budget must carry maxCandidateEvaluations >= 1 and maxIterations >= 1");
  }
  return null;
}

// ---------------------------------------------------------------------------
// The resolved search context
// ---------------------------------------------------------------------------

/** The resolved, seam-backed context one search runs against. */
export interface ProgramSearchContext {
  readonly input: ProductionProgramSearchInput;
  readonly policy: ProductionProgramSearchPolicy;
  /** Chain-eligible catalog listing (no-op-kind filtered), listing order. */
  readonly chainVocabulary: readonly ResolvedPawnTransform[];
  /** The organization descriptors visible in this tenant scope. */
  readonly organizations: readonly ProgramOrganizationDescriptor[];
  /** Exact-version transform resolution (the W7-B seam). */
  readonly transformSource: PawnTransformSourcePort;
  /** The LLM-flavored pawn kinds (from this package's ten §9 bodies). */
  readonly llmFlavoredPawnKinds: readonly string[];
}

/**
 * Resolves the search context through the seams (fail-closed):
 * - the catalog must list at least one CHAIN-ELIGIBLE definition (the
 *   no-op kind is filtered — the no-op path is the empty-chain baseline);
 * - the organization source must list at least one descriptor (programs
 *   need a producing organization; the no-op baseline does not).
 */
export async function resolveProgramSearchContext(
  input: ProductionProgramSearchInput,
  seams: {
    catalog: ProgramTransformCatalogPort;
    organizations: ProgramOrganizationSourcePort;
    transforms: PawnTransformSourcePort;
  },
): Promise<ProgramSearchContext | ProductionProgramSearchError> {
  const listing = await seams.catalog.listPromotedTransforms(input.scope);
  const chainVocabulary = listing.filter(
    (definition) => definition.kind !== "no-op-repost",
  );
  if (chainVocabulary.length === 0) {
    return fail(
      "transform-unresolved",
      "the promoted-transform catalog lists no chain-eligible definitions in this tenant scope (the no-op-repost kind is the empty-chain baseline, never a chain step)",
    );
  }
  const organizations = await seams.organizations.listOrganizations(input.scope);
  if (organizations.length === 0) {
    return fail(
      "organization-unresolved",
      "the organization source lists no organizations in this tenant scope (program candidates need a producing organization)",
    );
  }
  return Object.freeze({
    input,
    policy: input.policy,
    chainVocabulary,
    organizations,
    transformSource: seams.transforms,
    llmFlavoredPawnKinds: LLM_FLAVORED_PAWN_KINDS,
  });
}

/** Union of the capability requirements a candidate's chain declares. */
export const chainRequirementsOf = (
  candidate: CandidateProgram,
  resolved: readonly ResolvedPawnTransform[],
): readonly CapabilityRequirement[] => {
  const byKey = new Map<string, CapabilityRequirement>();
  for (const step of candidate.transformChain) {
    const definition = resolved.find(
      (d) => d.id === step.definitionId && d.version === step.definitionVersion,
    );
    if (definition === undefined) continue;
    for (const requirement of definition.capabilityRequirements) {
      const key = `${requirement.capabilityId as string}@${requirement.version as number}`;
      if (!byKey.has(key)) {
        byKey.set(key, requirement);
      }
    }
  }
  return [...byKey.values()];
};

/** ISO-8601 timestamp plus a duration (deterministic deadline derivation). */
export const deadlineAt = (anchor: Timestamp, durationMs: number): Timestamp =>
  new Date(Date.parse(anchor) + durationMs).toISOString() as Timestamp;

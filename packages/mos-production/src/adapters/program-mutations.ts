/**
 * INTERNAL sixteen-dimension mutation operators for the production
 * program search (LAB-016), part 1 — the STRUCTURAL dimensions (3–8) +
 * the operator table — NOT exported from the package index.
 *
 * Deterministic, order-frozen (§7 declaration order) dimension mutation
 * operators, exactly the W5-B generation discipline applied to program
 * candidates: each operator takes the incumbent + the resolved context
 * and returns the mutant (or `null` when the dimension is not mutable at
 * this point). Mutants maintain candidate validity BY CONSTRUCTION
 * (acquisition coverage and portfolio coherence are rebuilt with the
 * chain — program-mutation-support.ts); the search additionally dedups
 * by sixteen-dimension fingerprint and records the FULL fingerprint diff
 * vs the parent as the mutation's varied dimensions (the honest
 * provenance — exactly what varied, never less). The ECONOMICS operators
 * (dimensions 9–16) live in program-mutations-economics.ts (the oxlint
 * max-lines split precedent).
 *
 * Dimensions 1 (source/reference — GIVEN by the input) and 2 (no-op/repost
 * — the baseline is synthesized, never mutated INTO) have no operator; the
 * remaining FOURTEEN each have exactly one.
 */

import type { ProgramSearchContext } from "./program-search-validation.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import { TRANSFORM_PAWN_KINDS } from "../contracts/pawn-role.js";
import {
  programFeatureFingerprint,
  programFingerprintKeyOf,
  sourceReferenceSignatureOf,
  variedDimensionsBetween,
} from "./program-fingerprint.js";
import {
  cloneProgram,
  withChain,
  stepOf,
} from "./program-mutation-support.js";
import type { ProgramMutation } from "./program-mutation-support.js";
import {
  mutateEnginePortfolio,
  mutateHumanParticipation,
  mutateCapabilityAcquisition,
  mutateQualityThresholds,
  mutateCost,
  mutateLatency,
  mutateExpectedValueOfDelay,
  mutateStoppingPolicy,
} from "./program-mutations-economics.js";

// ---------------------------------------------------------------------------
// The structural operators (frozen §7 order; economics in part 2)
// ---------------------------------------------------------------------------

/** Dimension 3: transform chain (append; swap-last at the cap). */
const mutateTransformChain = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
  generationIndex: number,
): CandidateProgram | null => {
  const { chainVocabulary, policy } = context;
  const chain = candidate.transformChain;
  if (chain.length < policy.maxChainSteps) {
    const definition =
      chainVocabulary[(chain.length + generationIndex) % chainVocabulary.length];
    if (definition === undefined) return null;
    if (
      chain.some(
        (step) =>
          step.definitionId === definition.id &&
          step.definitionVersion === definition.version,
      )
    ) {
      return null;
    }
    return withChain(
      candidate,
      [...chain, stepOf(definition, policy.parameterPresetVocabulary[0] ?? "default")],
      chainVocabulary,
      policy.engineVocabulary,
    );
  }
  const last = chain[chain.length - 1];
  if (last === undefined) return null;
  const lastIndex = chainVocabulary.findIndex(
    (d) => d.id === last.definitionId && d.version === last.definitionVersion,
  );
  if (lastIndex < 0 || chainVocabulary.length < 2) return null;
  const next =
    chainVocabulary[(lastIndex + 1 + generationIndex) % chainVocabulary.length];
  if (
    next === undefined ||
    (next.id === last.definitionId && next.version === last.definitionVersion)
  ) {
    return null;
  }
  const swapped = [...chain];
  swapped[chain.length - 1] = stepOf(next, last.parameterPreset);
  return withChain(candidate, swapped, chainVocabulary, policy.engineVocabulary);
};

/** Dimension 4: transform parameters (advance the last step's preset). */
const mutateTransformParameters = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const presets = context.policy.parameterPresetVocabulary;
  if (candidate.transformChain.length === 0 || presets.length < 2) return null;
  const last = candidate.transformChain[candidate.transformChain.length - 1];
  if (last === undefined) return null;
  const index = presets.indexOf(last.parameterPreset);
  const next = presets[(index + 1) % presets.length];
  if (next === undefined || next === last.parameterPreset) return null;
  const mutant = cloneProgram(candidate);
  mutant.transformChain = [
    ...candidate.transformChain.slice(0, -1),
    Object.freeze({ ...last, parameterPreset: next, parameters: Object.freeze({ preset: next }) }),
  ];
  return mutant;
};

/** Dimension 5: production modality (modality + studio format advance). */
const mutateProductionModality = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const modalities = context.policy.modalityVocabulary;
  const formats = context.input.studioFormatVocabulary;
  if (modalities.length < 2 && formats.length < 2) return null;
  const mutant = cloneProgram(candidate);
  const mIndex = modalities.indexOf(candidate.modality);
  mutant.modality = modalities[(mIndex + 1) % modalities.length] ?? candidate.modality;
  const fIndex = formats.indexOf(candidate.studioFormat);
  mutant.studioFormat = formats[(fIndex + 1) % formats.length] ?? candidate.studioFormat;
  if (
    mutant.modality === candidate.modality &&
    mutant.studioFormat === candidate.studioFormat
  ) {
    return null;
  }
  return mutant;
};

/** Dimension 6: organization (advance to the next descriptor). */
const mutateOrganization = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const orgs = context.organizations;
  if (orgs.length < 2) return null;
  const current = candidate.organization;
  const index =
    current === null
      ? -1
      : orgs.findIndex((o) => o.id === current.organizationId);
  const next = orgs[(index + 1) % orgs.length];
  if (next === undefined) return null;
  if (current !== null && next.id === current.organizationId) return null;
  const mutant = cloneProgram(candidate);
  mutant.organization = Object.freeze({
    organizationId: next.id,
    organizationVersion: next.version,
  });
  return mutant;
};

/** Dimension 7: pawn agents (add the next kind; drop the last at the cap). */
const mutatePawnAgents = (
  candidate: CandidateProgram,
  generationIndex: number,
): CandidateProgram | null => {
  const pawns = candidate.pawnAgents;
  if (pawns.length >= TRANSFORM_PAWN_KINDS.length) {
    if (pawns.length === 0) return null;
    const mutant = cloneProgram(candidate);
    mutant.pawnAgents = pawns.slice(0, -1);
    mutant.modelAssignments = mutant.modelAssignments.filter(
      (a) => a.pawnKind !== pawns[pawns.length - 1],
    );
    return mutant;
  }
  const start = (pawns.length + generationIndex) % TRANSFORM_PAWN_KINDS.length;
  for (let offset = 0; offset < TRANSFORM_PAWN_KINDS.length; offset += 1) {
    const kind = TRANSFORM_PAWN_KINDS[(start + offset) % TRANSFORM_PAWN_KINDS.length];
    if (kind !== undefined && !pawns.includes(kind)) {
      const mutant = cloneProgram(candidate);
      mutant.pawnAgents = [...pawns, kind];
      return mutant;
    }
  }
  return null;
};

/** Dimension 8: model assignment (LLM-flavored pawns ONLY — DATA refs). */
const mutateModelAssignment = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
  generationIndex: number,
): CandidateProgram | null => {
  const models = context.policy.modelVocabulary;
  const llmKinds = candidate.pawnAgents.filter((kind) =>
    context.llmFlavoredPawnKinds.includes(kind),
  );
  if (llmKinds.length === 0 || models.length === 0) return null;
  const mutant = cloneProgram(candidate);
  const unassigned = llmKinds.filter(
    (kind) => !mutant.modelAssignments.some((a) => a.pawnKind === kind),
  );
  if (unassigned.length > 0) {
    const kind = unassigned[0];
    if (kind === undefined) return null;
    const model = models[(mutant.modelAssignments.length + generationIndex) % models.length];
    if (model === undefined) return null;
    mutant.modelAssignments = [
      ...mutant.modelAssignments,
      Object.freeze({ pawnKind: kind, modelRef: model }),
    ];
    return mutant;
  }
  if (models.length < 2) return null;
  const first = mutant.modelAssignments[0];
  if (first === undefined) return null;
  const mIndex = models.indexOf(first.modelRef);
  const next = models[(mIndex + 1) % models.length];
  if (next === undefined || next === first.modelRef) return null;
  mutant.modelAssignments = [
    Object.freeze({ pawnKind: first.pawnKind, modelRef: next }),
    ...mutant.modelAssignments.slice(1),
  ];
  return mutant;
};


// ---------------------------------------------------------------------------
// The operator table (frozen §7 order)
// ---------------------------------------------------------------------------

/**
 * Produces the mutants of one incumbent, in FROZEN §7 dimension order.
 * Each operator varies ONE PRIMARY dimension; the coherence dimensions
 * that must move with it (parameters/portfolio/acquisition follow the
 * chain; acquisitions degrade with dropped human tasks) vary WITH it —
 * the recorded `variedDimensions` is the FULL fingerprint diff vs the
 * parent (exactly what varied, never less).
 */
export function programMutationsOf(
  incumbent: CandidateProgram,
  context: ProgramSearchContext,
  generationIndex: number,
): readonly ProgramMutation[] {
  const mutations: ProgramMutation[] = [];
  const sourceSignature = sourceReferenceSignatureOf(
    context.input.sourceArtifactRefs,
  );
  const parentFingerprint = programFeatureFingerprint(incumbent, sourceSignature);
  const push = (mutant: CandidateProgram | null): void => {
    if (mutant === null) return;
    const fingerprint = programFeatureFingerprint(mutant, sourceSignature);
    mutations.push({
      candidate: mutant,
      fingerprint,
      key: programFingerprintKeyOf(fingerprint),
      variedDimensions: variedDimensionsBetween(parentFingerprint, fingerprint),
    });
  };
  push(mutateTransformChain(incumbent, context, generationIndex));
  push(mutateTransformParameters(incumbent, context));
  push(mutateProductionModality(incumbent, context));
  push(mutateOrganization(incumbent, context));
  push(mutatePawnAgents(incumbent, generationIndex));
  push(mutateModelAssignment(incumbent, context, generationIndex));
  push(mutateEnginePortfolio(incumbent, context, generationIndex));
  push(mutateHumanParticipation(incumbent, context, generationIndex));
  push(mutateCapabilityAcquisition(incumbent, context));
  push(mutateQualityThresholds(incumbent, context));
  push(mutateCost(incumbent, context));
  push(mutateLatency(incumbent, context));
  push(mutateExpectedValueOfDelay(incumbent, context));
  push(mutateStoppingPolicy(incumbent, context));
  return mutations;
}


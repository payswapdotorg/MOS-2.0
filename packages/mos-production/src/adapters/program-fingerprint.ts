/**
 * INTERNAL sixteen-dimension fingerprint derivation for the production
 * program search (LAB-016) — NOT exported from the package index.
 *
 * One deterministic string signature per §7 dimension (the W5-B
 * organization-fingerprint discipline applied to program candidates):
 * two candidates with equal fingerprints are the SAME POINT in the
 * sixteen-dimension search space (dedup); the dimensions whose
 * fingerprints differ between parent and child are exactly the dimensions
 * a generation step varied (provenance).
 *
 * Dimension 1 (source/reference) is GIVEN by the search input — its
 * signature is derived from the input's source artifact refs (identical
 * for every candidate of one search; it is recorded so the fingerprint is
 * complete over all sixteen dimensions).
 */

import type { ArtifactRef } from "@mos/contracts";

import type { ProgramFeatureFingerprint } from "../contracts/program-dimensions.js";
import { PROGRAM_SEARCH_DIMENSIONS } from "../contracts/program-dimensions.js";
import type { ProgramSearchDimension } from "../contracts/program-dimensions.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import { stableTagOf } from "../domain/program-request-compose.js";

/** The GIVEN source-reference signature of one search input. */
export const sourceReferenceSignatureOf = (
  sourceArtifactRefs: readonly ArtifactRef[],
): string =>
  `src:${sourceArtifactRefs
    .map((ref) => `${ref.artifactId as string}@${ref.version as number}`)
    .join("+")}`;

/** The candidate key: the sixteen signatures joined in frozen order. */
export const programFingerprintKeyOf = (
  fingerprint: ProgramFeatureFingerprint,
): string => PROGRAM_SEARCH_DIMENSIONS.map((d) => fingerprint[d]).join("||");

/**
 * The sixteen-dimension feature fingerprint of one candidate program.
 * Pure function of (candidate, source-reference signature).
 */
export function programFeatureFingerprint(
  candidate: CandidateProgram,
  sourceReferenceSignature: string,
): ProgramFeatureFingerprint {
  const chain = candidate.transformChain
    .map(
      (step) =>
        `${step.definitionId as string}@${step.definitionVersion as number}`,
    )
    .join(">");
  const parameters = candidate.transformChain
    .map((step) => `${step.parameterPreset}:${stableTagOf(JSON.stringify(step.parameters))}`)
    .join(">");
  const assignments = [...candidate.modelAssignments]
    .map((a) => `${a.pawnKind}:${a.modelRef as string}`)
    .sort()
    .join(",");
  const portfolio = candidate.enginePortfolio
    .map(
      (b) =>
        `${b.capabilityId as string}@${b.capabilityVersion as number}:${b.engineId as string}@${b.engineVersion as number}`,
    )
    .join(",");
  const acquisitions = candidate.capabilityAcquisition
    .map(
      (a) =>
        `${a.requirement.capabilityId as string}@${a.requirement.version as number}:${a.mode}`,
    )
    .join(",");
  const humanTasks = [...candidate.humanTasks].map((t) => t as string).sort().join(",");
  const pawns = [...candidate.pawnAgents].sort().join(",");
  return Object.freeze({
    "source-reference": sourceReferenceSignature,
    "no-op-repost": candidate.isNoopBaseline ? "no-op" : "program",
    "transform-chain": chain,
    "transform-parameters": parameters,
    "production-modality": `${candidate.modality}:${candidate.studioFormat as string}`,
    organization:
      candidate.organization === null
        ? "synthesized-no-op"
        : `${candidate.organization.organizationId}@${candidate.organization.organizationVersion as number}`,
    "pawn-agents": pawns,
    "model-assignment": assignments,
    "engine-portfolio": portfolio,
    "human-participation": humanTasks,
    "capability-acquisition": acquisitions,
    "quality-thresholds": `${candidate.qualityThresholds.floor}:${candidate.qualityThresholds.evaluatorRef as string}`,
    cost: `${candidate.budget.maxCost.amount}/${candidate.budget.maxCost.currency}/${candidate.budget.maxDurationMs}`,
    latency: `${candidate.deadline}:${candidate.expectedDurationMs}`,
    "expected-value-of-delay": `${candidate.delayPolicy.maxWaitMs}:${candidate.delayPolicy.onDelayExceeded}:${candidate.delayExpectation.estimatedWaitMs}`,
    "stopping-substitution-policy": `${candidate.stoppingPolicy.maxRetries}:${candidate.stoppingPolicy.substitutionPreference.join(">")}`,
  });
}

/**
 * The dimensions whose fingerprints differ between parent and child —
 * exactly the dimensions a generation step varied (provenance).
 */
export function variedDimensionsBetween(
  parent: ProgramFeatureFingerprint,
  child: ProgramFeatureFingerprint,
): readonly ProgramSearchDimension[] {
  const varied: ProgramSearchDimension[] = [];
  for (const dimension of PROGRAM_SEARCH_DIMENSIONS) {
    if (parent[dimension] !== child[dimension]) {
      varied.push(dimension);
    }
  }
  return varied;
}

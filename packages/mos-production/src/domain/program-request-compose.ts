/**
 * Canonical CORE-001 ProductionRequest composition (LAB-016).
 *
 * Every ranked candidate carries a composed `ProductionRequest` — the
 * frozen contract's required fields ([id, version, scope, objective,
 * sourceArtifacts, strategyRef, transformGraphRef, organizationRef,
 * studioFormat, capabilityRequirements, humanTasks, acceptanceCriteria,
 * budget, deadline, delayPolicy, rightsContext, returnContract]) built
 * FROM the candidate's sixteen §7 dimensions + the search input, so
 * contract completeness holds BY CONSTRUCTION (and is pinned anyway with
 * `assertRequiredFields` at composition time — belt and braces — plus the
 * runtime test battery).
 *
 * Canonical drops (documented, the W6-A/W7-A precedent): the candidate's
 * pawn agents / model assignments / engine portfolio / acquisition modes /
 * stopping-substitution policy / declared delay expectations have no field
 * on the frozen canonical contract — they stay on the candidate record
 * (the composition root binds them when a real execution is requested).
 */

import type {
  AcceptanceCriterion,
  ProductionRequest,
  ProductionRequestId,
  TransformGraphRef,
  Version,
} from "@mos/contracts";
import { assertRequiredFields } from "@mos/contracts";

import type {
  CandidateProgram,
  ProgramOrganizationCitation,
} from "../contracts/program-candidate.js";
import { NO_OP_PROGRAM_REFS } from "../contracts/program-candidate.js";
import type { ProductionProgramSearchInput } from "../contracts/program-search.js";

// ---------------------------------------------------------------------------
// Deterministic derived identifiers
// ---------------------------------------------------------------------------

/**
 * Deterministic 32-bit FNV-1a hash of a string (hex, zero-padded) — used
 * ONLY to derive stable synthetic citation refs (never a security claim).
 */
export const stableTagOf = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * The synthesized transform-graph citation of a candidate's chain:
 * `program-graph:<hash of ids@versions#presets>` — DETERMINISTIC and
 * disclosed (the composition root rebinds it to a real LAB-011
 * TransformGraph version; the W5-A binding follow-up).
 */
export const programTransformGraphRefOf = (
  candidate: CandidateProgram,
): TransformGraphRef =>
  candidate.transformChain.length === 0
    ? NO_OP_PROGRAM_REFS.transformGraphRef
    : (`program-graph:${stableTagOf(
        candidate.transformChain
          .map(
            (step) =>
              `${step.definitionId as string}@${step.definitionVersion as number}#${step.parameterPreset}`,
          )
          .join(">"),
      )}` as TransformGraphRef);

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * The composed acceptance criteria of one candidate: the quality-floor
 * criterion (with the declared evaluator) for program candidates; the
 * verbatim-repost criterion for the no-op baseline.
 */
export const acceptanceCriteriaOf = (
  candidate: CandidateProgram,
): readonly AcceptanceCriterion[] =>
  candidate.isNoopBaseline
    ? [
        Object.freeze({
          description: "verbatim repost — the source artifacts are returned unchanged",
        } satisfies AcceptanceCriterion),
      ]
    : [
        Object.freeze({
          description: `program outputs meet the declared quality floor ${candidate.qualityThresholds.floor}`,
          evaluator: candidate.qualityThresholds.evaluatorRef,
        } satisfies AcceptanceCriterion),
      ];

/**
 * Compose the canonical CORE-001 `ProductionRequest` of one candidate.
 * Fails closed (throws) if the composition ever drifts off the frozen
 * required-field manifest — `assertRequiredFields` runs on every composed
 * request, so a drifted composition can never leave this function.
 */
export function composeProgramRequest(
  input: ProductionProgramSearchInput,
  candidate: CandidateProgram,
  requestId: ProductionRequestId,
): ProductionRequest {
  const organizationCitation: ProgramOrganizationCitation | null =
    candidate.isNoopBaseline ? null : candidate.organization;
  const request: ProductionRequest = Object.freeze({
    id: requestId,
    version: 1 as Version,
    scope: input.scope,
    objective: input.objective,
    sourceArtifacts: [...input.sourceArtifactRefs],
    strategyRef: input.strategyRef,
    transformGraphRef: programTransformGraphRefOf(candidate),
    organizationRef:
      organizationCitation === null
        ? (NO_OP_PROGRAM_REFS.organizationRef as ProductionRequest["organizationRef"])
        : (organizationCitation.organizationId as ProductionRequest["organizationRef"]),
    studioFormat: candidate.isNoopBaseline
      ? NO_OP_PROGRAM_REFS.studioFormat
      : candidate.studioFormat,
    capabilityRequirements: candidate.capabilityAcquisition.map(
      (entry) => entry.requirement,
    ),
    humanTasks: [...candidate.humanTasks],
    acceptanceCriteria: acceptanceCriteriaOf(candidate),
    budget: candidate.budget,
    deadline: candidate.deadline,
    delayPolicy: candidate.delayPolicy,
    rightsContext: input.rightsContext,
    returnContract: input.returnContract,
  });
  assertRequiredFields(request, "ProductionRequest");
  return request;
}

/**
 * The deterministic request id of one candidate:
 * `program-request:<candidate key>` (the no-op baseline's key is pinned).
 */
export const programRequestIdOf = (
  candidateKey: string,
): ProductionRequestId =>
  `program-request:${candidateKey}` as ProductionRequestId;

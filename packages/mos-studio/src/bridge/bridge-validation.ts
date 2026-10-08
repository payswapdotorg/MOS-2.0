/**
 * BRIDGE-001 fail-closed intake validation — the typed bridge-entry gate.
 *
 * A SELECTED lab candidate enters the bridge ONLY as a REAL LAB-016 search
 * result's OWN entry (`noopBaseline` or a `ranked` member, identity-checked
 * against the provided result object) whose canonical `ProductionRequest` is
 * versioned and whose provenance is version-pinned. Malformed,
 * unversioned, unprovenance'd or caller-fabricated shapes fail closed with
 * typed failures BEFORE any authority consultation or studio invocation —
 * nothing attributable happened, so nothing is recorded (the W8-A caller
 * error discipline).
 *
 * Every numeric the entry record will carry is finite-guarded here (W9-B D5:
 * NaN/±Infinity never reach a stored record).
 */

import type { RankedCandidateProgram } from "@mos/production";

import type { StudioFormatId } from "../contracts/studio-format.js";
import type {
  LabToStudioCandidateCitation,
  LabToStudioDeclaredExpectations,
  LabToStudioEntryFailure,
  LabToStudioEntryRequest,
} from "./contracts/lab-to-studio-entry.js";
import {
  INPUT_KINDS,
  isCanonicalStringRef,
  isPositiveInteger,
  isRecord,
  nonBlank,
} from "./validation-guards.js";
import { validateCandidate } from "./candidate-validation.js";

// ---------------------------------------------------------------------------
// The validated projection (what the bridge core consumes onward)
// ---------------------------------------------------------------------------

/** The validated, derived pieces of one entry request. */
export interface ValidatedLabToStudioEntry {
  /** The canonical composed request of the selected candidate. */
  readonly request: RankedCandidateProgram["request"];
  /** The selected candidate program (the sixteen §7 dimensions). */
  readonly candidate: RankedCandidateProgram["candidate"];
  /** The evaluation's declared expectations (finite-guarded projection). */
  readonly expectations: LabToStudioDeclaredExpectations;
  /** The candidate citation the entry record will pin. */
  readonly citation: LabToStudioCandidateCitation;
  /** The studio format id the studio session will run under. */
  readonly studioFormatId: StudioFormatId;
  /** The producing organization citation (validated non-null). */
  readonly organizationCitation: LabToStudioCandidateCitation["organizationCitation"];
}

export type ValidatedEntryOutcome =
  | { readonly ok: true; readonly value: ValidatedLabToStudioEntry }
  | { readonly ok: false; readonly failure: LabToStudioEntryFailure };

// ---------------------------------------------------------------------------
// The request-frame validation (caller shape errors — nothing recorded)
// ---------------------------------------------------------------------------

function invalidRequest(reason: string): ValidatedEntryOutcome {
  return { ok: false, failure: { kind: "invalid-entry-request", reason } };
}

function validateRequestFrame(request: LabToStudioEntryRequest): ValidatedEntryOutcome | null {
  if (!isRecord(request) || !isRecord(request.scope) || !isCanonicalStringRef(request.scope.tenantId)) {
    return invalidRequest("scope.tenantId must be a non-blank string primitive (§31 tenant scoping — a coerced object is never a tenant id)");
  }
  if (!isCanonicalStringRef(request.actor)) {
    return invalidRequest("actor must be a non-blank string IdentityRef primitive (§30 observability)");
  }
  if (!isPositiveInteger(request.missionVersion)) {
    return invalidRequest("missionVersion must be a positive integer (versioned mission citations — never 'latest')");
  }
  if (!isPositiveInteger(request.formatVersion)) {
    return invalidRequest("formatVersion must be a positive integer (the studio format plugin version)");
  }
  if (!Array.isArray(request.policy) || request.policy.length === 0) {
    return invalidRequest("policy must be a non-empty citation list (an empty list always fails closed)");
  }
  const seenPolicyRefs = new Set<string>();
  for (const citation of request.policy) {
    if (!isRecord(citation) || !nonBlank(citation.id) || !isPositiveInteger(citation.version)) {
      return invalidRequest("every policy citation must carry a non-blank id and an exact positive integer version");
    }
    const key = JSON.stringify([citation.id, citation.version]);
    if (seenPolicyRefs.has(key)) {
      return invalidRequest(`duplicate policy citation ${key} — citation order is preserved, duplicates are not`);
    }
    seenPolicyRefs.add(key);
  }
  if (!isRecord(request.intake) || typeof request.intake.inputKind !== "string") {
    return invalidRequest("intake.inputKind must be declared (the operator's plan — never guessed)");
  }
  if (!INPUT_KINDS.has(request.intake.inputKind)) {
    return invalidRequest(`intake.inputKind "${request.intake.inputKind}" is outside the studio input-kind vocabulary`);
  }
  if (
    request.intake.participantCount !== undefined &&
    !(Number.isInteger(request.intake.participantCount) && (request.intake.participantCount as number) >= 1)
  ) {
    return invalidRequest("intake.participantCount, when declared, must be an integer ≥ 1");
  }
  if (typeof request.intake.hasScriptOrQuestionGraph !== "boolean") {
    return invalidRequest("intake.hasScriptOrQuestionGraph must be declared");
  }
  if (!isRecord(request.searchResult)) {
    return invalidRequest("searchResult must be a REAL LAB-016 production program search result object");
  }
  if (!isCanonicalStringRef(request.searchResult.tenantId)) {
    return invalidRequest("searchResult.tenantId must be a non-blank string primitive (the REAL result's own §31 scope)");
  }
  if (!isRecord(request.selected)) {
    return invalidRequest("selected must be a REAL RankedCandidateProgram object");
  }
  return null;
}

// ---------------------------------------------------------------------------
// The declared-expectations projection (finite-guarded, verbatim disclosure)
// ---------------------------------------------------------------------------

function projectExpectations(
  selected: RankedCandidateProgram,
): LabToStudioDeclaredExpectations {
  const evaluation = selected.evaluation;
  const baseline = selected.comparisonToBaseline;
  return {
    expectedReward: evaluation.expectedReward,
    interval: {
      lower: evaluation.interval.lower,
      upper: evaluation.interval.upper,
    },
    baselineExpectedReward: baseline.baselineExpectedReward,
    expectedRewardDelta: baseline.expectedRewardDelta,
    expectedValueOfDelay: evaluation.expectedValueOfDelay.value,
    disclosure: evaluation.disclosure,
    counterfactual: true,
  };
}

// ---------------------------------------------------------------------------
// The public validation entry point
// ---------------------------------------------------------------------------

/**
 * Validate one Lab → Studio entry request fail-closed. Returns the validated
 * projection (canonical request + candidate + expectations + citation) or a
 * typed caller-shape failure (nothing attributable — nothing is recorded).
 */
export function validateLabToStudioEntry(
  request: LabToStudioEntryRequest,
): ValidatedEntryOutcome {
  const frameFailure = validateRequestFrame(request);
  if (frameFailure !== null) {
    return frameFailure;
  }
  const candidateFailure = validateCandidate(request);
  if (candidateFailure !== null) {
    return candidateFailure;
  }
  const { selected, searchResult } = request;
  const citation: LabToStudioCandidateCitation = {
    searchResultId: searchResult.id,
    rank: selected.rank,
    requestRef: { id: selected.request.id, version: selected.request.version },
    candidateOrigin: selected.provenance.origin,
    isNoopBaseline: false,
    transformChain: selected.candidate.transformChain.map((step) => ({
      definitionId: step.definitionId,
      definitionVersion: step.definitionVersion,
    })),
    organizationCitation: {
      organizationId: selected.candidate.organization?.organizationId ?? "",
      organizationVersion: selected.candidate.organization?.organizationVersion ?? 0,
    },
    provenance: {
      policyVersion: selected.provenance.policyVersion,
      seed: selected.provenance.seed,
      generationIndex: selected.provenance.generationIndex ?? null,
      variedDimensions: [...selected.provenance.variedDimensions],
    },
    rightsContext: {
      rightsRefs: [...selected.request.rightsContext.rightsRefs],
      consentRefs: [...selected.request.rightsContext.consentRefs],
    },
  };
  return {
    ok: true,
    value: {
      request: selected.request,
      candidate: selected.candidate,
      expectations: projectExpectations(selected),
      citation,
      studioFormatId: selected.candidate.studioFormat,
      organizationCitation: citation.organizationCitation,
    },
  };
}

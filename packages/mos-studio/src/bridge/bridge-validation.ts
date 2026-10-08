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

import type { StudioFormatId } from "../contracts/refs.js";
import type {
  LabToStudioCandidateCitation,
  LabToStudioDeclaredExpectations,
  LabToStudioEntryFailure,
  LabToStudioEntryRequest,
} from "./contracts/lab-to-studio-entry.js";

// ---------------------------------------------------------------------------
// Small shared guards
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A positive (≥ 1) finite integer. */
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 1;

/** A finite number (W9-B D5 guard — NaN/±Infinity fail closed). */
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

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
  if (!isRecord(request) || !isRecord(request.scope) || !nonBlank(String(request.scope.tenantId ?? ""))) {
    return invalidRequest("scope.tenantId must be a non-blank string (§31 tenant scoping)");
  }
  if (!nonBlank(String(request.actor ?? ""))) {
    return invalidRequest("actor must be a non-blank IdentityRef (§30 observability)");
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
    if (!isRecord(citation) || !nonBlank(String(citation.id ?? "")) || !isPositiveInteger(citation.version)) {
      return invalidRequest("every policy citation must carry a non-blank id and an exact positive integer version");
    }
    const key = JSON.stringify([String(citation.id), citation.version]);
    if (seenPolicyRefs.has(key)) {
      return invalidRequest(`duplicate policy citation ${key} — citation order is preserved, duplicates are not`);
    }
    seenPolicyRefs.add(key);
  }
  if (!isRecord(request.intake) || typeof request.intake.inputKind !== "string") {
    return invalidRequest("intake.inputKind must be declared (the operator's plan — never guessed)");
  }
  const INPUT_KINDS = new Set(["complete-script", "question-list", "intent", "intent-with-source-material"]);
  if (!INPUT_KINDS.has(request.intake.inputKind)) {
    return invalidRequest(`intake.inputKind "${request.intake.inputKind}" is outside the studio input-kind vocabulary`);
  }
  if (
    request.intake.participantCount !== undefined &&
    !(Number.isInteger(request.intake.participantCount) && request.intake.participantCount >= 1)
  ) {
    return invalidRequest("intake.participantCount, when declared, must be an integer ≥ 1");
  }
  if (typeof request.intake.hasScriptOrQuestionGraph !== "boolean") {
    return invalidRequest("intake.hasScriptOrQuestionGraph must be declared");
  }
  if (!isRecord(request.searchResult)) {
    return invalidRequest("searchResult must be a REAL LAB-016 production program search result object");
  }
  if (!isRecord(request.selected)) {
    return invalidRequest("selected must be a REAL RankedCandidateProgram object");
  }
  return null;
}

// ---------------------------------------------------------------------------
// The candidate validation (never a raw caller-claimed shape)
// ---------------------------------------------------------------------------

/** Identity-check the candidate against the result's OWN entries. */
function candidateBelongsToResult(
  selected: RankedCandidateProgram,
  result: LabToStudioEntryRequest["searchResult"],
): boolean {
  if (result.noopBaseline === selected) {
    return true;
  }
  return Array.isArray(result.ranked) && result.ranked.some((entry) => entry === selected);
}

function validateCandidate(request: LabToStudioEntryRequest): ValidatedEntryOutcome | null {
  const { selected, searchResult } = request;
  if (!candidateBelongsToResult(selected, searchResult)) {
    return {
      ok: false,
      failure: {
        kind: "candidate-not-in-result",
        reason:
          "the selected candidate is not one of the provided search result's own entries — a lookalike shape is never accepted",
      },
    };
  }
  const candidate = selected.candidate;
  if (!isRecord(candidate)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.candidate is missing" } };
  }
  if (candidate.isNoopBaseline === true) {
    return {
      ok: false,
      failure: {
        kind: "no-op-baseline-not-studio-enterable",
        reason:
          "the no-op baseline is the search's always-present comparison baseline (empty chain, no producing organization, synthetic format citation) — it cannot enter studio production; select a real candidate",
      },
    };
  }
  if (candidate.modality !== "studio" && candidate.modality !== "hybrid") {
    return {
      ok: false,
      failure: {
        kind: "candidate-modality-not-studio",
        reason: `candidate modality "${String(candidate.modality)}" is not studio-actuated (§7 dimension 5: only studio/hybrid programs enter the Content Studio)`,
      },
    };
  }
  if (candidate.organization === null || !isRecord(candidate.organization)) {
    return {
      ok: false,
      failure: { kind: "malformed-candidate", reason: "a studio-enterable candidate must carry a producing organization citation" },
    };
  }
  if (!isPositiveInteger(candidate.organization.organizationVersion)) {
    return { ok: false, failure: { kind: "unversioned-candidate", reason: "organization citation must pin an exact positive version" } };
  }
  if (!Array.isArray(candidate.transformChain)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.transformChain is missing" } };
  }
  for (const step of candidate.transformChain) {
    if (!isRecord(step) || !nonBlank(String(step.definitionId ?? "")) || !isPositiveInteger(step.definitionVersion)) {
      return { ok: false, failure: { kind: "unversioned-candidate", reason: "every transform chain step must pin definitionId @ exact positive version" } };
    }
  }
  if (typeof candidate.studioFormat !== "string" || candidate.studioFormat.length === 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.studioFormat is missing" } };
  }

  // The canonical composed request: required fields, versioned, provenance'd.
  const composed = selected.request;
  if (!isRecord(composed)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.request (the canonical ProductionRequest) is missing" } };
  }
  if (!nonBlank(String(composed.id ?? ""))) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request id is missing" } };
  }
  if (!isPositiveInteger(composed.version)) {
    return { ok: false, failure: { kind: "unversioned-candidate", reason: "canonical request version must be a positive integer" } };
  }
  if (!isRecord(composed.scope) || !nonBlank(String(composed.scope.tenantId ?? ""))) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request scope.tenantId is missing (§31)" } };
  }
  if (String(composed.scope.tenantId) !== String(request.scope.tenantId)) {
    return {
      ok: false,
      failure: {
        kind: "tenant-mismatch",
        reason: `the candidate's request scope (tenant "${String(composed.scope.tenantId)}") does not match the entry scope (tenant "${String(request.scope.tenantId)}") — cross-tenant entries are denied`,
      },
    };
  }
  if (String(searchResult.tenantId) !== String(request.scope.tenantId)) {
    return {
      ok: false,
      failure: {
        kind: "tenant-mismatch",
        reason: `the search result's tenant "${String(searchResult.tenantId)}" does not match the entry scope (tenant "${String(request.scope.tenantId)}")`,
      },
    };
  }
  if (composed.studioFormat !== candidate.studioFormat) {
    return {
      ok: false,
      failure: {
        kind: "format-mismatch",
        reason: `the canonical request cites studio format "${String(composed.studioFormat)}" while the candidate program declares "${String(candidate.studioFormat)}"`,
      },
    };
  }
  if (String(composed.organizationRef) !== String(candidate.organization.organizationId)) {
    return {
      ok: false,
      failure: {
        kind: "organization-citation-mismatch",
        reason: `the canonical request cites organization "${String(composed.organizationRef)}" while the candidate program declares "${String(candidate.organization.organizationId)}"`,
      },
    };
  }
  if (!Array.isArray(composed.sourceArtifacts) || composed.sourceArtifacts.length === 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request sourceArtifacts must be non-empty" } };
  }
  for (const source of composed.sourceArtifacts) {
    if (!isRecord(source) || !nonBlank(String(source.artifactId ?? ""))) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every source artifact must carry an artifactId" } };
    }
  }
  if (!isRecord(composed.rightsContext) || !Array.isArray(composed.rightsContext.rightsRefs)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request rightsContext.rightsRefs is missing" } };
  }
  if (composed.rightsContext.rightsRefs.length === 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "the rights frame must cite at least one explicit grant (§27 — no frameless production)" } };
  }
  if (!Array.isArray(composed.rightsContext.consentRefs)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request rightsContext.consentRefs is missing" } };
  }
  const budget = composed.budget;
  if (!isRecord(budget) || !isRecord(budget.maxCost)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request budget is missing" } };
  }
  if (!isFiniteNumber(budget.maxCost.amount) || budget.maxCost.amount < 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "budget.maxCost.amount must be a finite non-negative number" } };
  }
  if (typeof budget.maxCost.currency !== "string" || budget.maxCost.currency.length === 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "budget.maxCost.currency must be non-blank" } };
  }
  if (typeof composed.deadline !== "string" || composed.deadline.length === 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request deadline is missing (the policy gate's deadline context)" } };
  }

  // The provenance: version-pinned search provenance (fingerprint + dims).
  const provenance = selected.provenance;
  if (!isRecord(provenance)) {
    return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "candidate.provenance is missing" } };
  }
  if (!isPositiveInteger(provenance.policyVersion)) {
    return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "provenance.policyVersion must pin the declared search policy version" } };
  }
  if (!Number.isFinite(provenance.seed) || typeof provenance.seed !== "number") {
    return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "provenance.seed is missing (determinism citation)" } };
  }
  if (!isRecord(provenance.fingerprint)) {
    return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "provenance.fingerprint (the sixteen-dimension fingerprint) is missing" } };
  }
  if (!Array.isArray(provenance.variedDimensions) || provenance.variedDimensions.length === 0) {
    return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "provenance.variedDimensions must be a non-empty dimension list" } };
  }
  if (provenance.generationIndex !== null && !isPositiveInteger(provenance.generationIndex)) {
    return { ok: false, failure: { kind: "unversioned-candidate", reason: "provenance.generationIndex must be null or a positive integer" } };
  }

  // The evaluation: the declared expectations BRIDGE-002 consumes (finite).
  const evaluation = selected.evaluation;
  if (!isRecord(evaluation)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.evaluation is missing" } };
  }
  if (!isFiniteNumber(evaluation.expectedReward)) {
    return { ok: false, failure: { kind: "invalid-declared-expectations", reason: "evaluation.expectedReward must be finite" } };
  }
  if (!isRecord(evaluation.interval) || !isFiniteNumber(evaluation.interval.lower) || !isFiniteNumber(evaluation.interval.upper)) {
    return { ok: false, failure: { kind: "invalid-declared-expectations", reason: "evaluation.interval bounds must be finite" } };
  }
  if (evaluation.interval.lower > evaluation.interval.upper) {
    return { ok: false, failure: { kind: "invalid-declared-expectations", reason: "evaluation.interval.lower must not exceed upper" } };
  }
  const baseline = selected.comparisonToBaseline;
  if (
    !isRecord(baseline) ||
    !isFiniteNumber(baseline.baselineExpectedReward) ||
    !isFiniteNumber(baseline.expectedRewardDelta)
  ) {
    return { ok: false, failure: { kind: "invalid-declared-expectations", reason: "comparisonToBaseline (the §7 always-present baseline comparison) must be finite" } };
  }
  const evd = evaluation.expectedValueOfDelay;
  if (!isRecord(evd) || !isFiniteNumber(evd.value)) {
    return { ok: false, failure: { kind: "invalid-declared-expectations", reason: "expectedValueOfDelay.expectedValue (the §2 first-class variable) must be finite" } };
  }
  if (typeof evaluation.disclosure !== "string" || evaluation.disclosure.length === 0) {
    return { ok: false, failure: { kind: "invalid-declared-expectations", reason: "evaluation.disclosure must be carried verbatim" } };
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
    searchResultId: String(searchResult.id),
    rank: selected.rank,
    requestRef: { id: selected.request.id, version: selected.request.version },
    candidateOrigin: String(selected.provenance.origin),
    isNoopBaseline: false,
    transformChain: selected.candidate.transformChain.map((step) => ({
      definitionId: String(step.definitionId),
      definitionVersion: step.definitionVersion,
    })),
    organizationCitation: {
      organizationId: String(selected.candidate.organization?.organizationId),
      organizationVersion: (selected.candidate.organization?.organizationVersion ?? 0),
    },
    provenance: {
      policyVersion: selected.provenance.policyVersion,
      seed: selected.provenance.seed,
      generationIndex: selected.provenance.generationIndex ?? null,
      variedDimensions: selected.provenance.variedDimensions.map((dimension) => String(dimension)),
    },
    rightsContext: {
      rightsRefs: selected.request.rightsContext.rightsRefs.map((ref) => String(ref)),
      consentRefs: selected.request.rightsContext.consentRefs.map((ref) => String(ref)),
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

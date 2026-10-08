/**
 * BRIDGE-001 candidate validation (extracted from bridge-validation.ts — the
 * file-length policy, behavior-identical).
 *
 * A SELECTED lab candidate enters the bridge ONLY as a REAL LAB-016 search
 * result's OWN entry (`noopBaseline` or a `ranked` member, identity-checked
 * against the provided result object) whose canonical `ProductionRequest` is
 * versioned and whose provenance is version-pinned. Malformed, unversioned,
 * unprovenance'd or caller-fabricated shapes fail closed with typed
 * failures BEFORE any authority consultation or studio invocation — nothing
 * attributable happened, so nothing is recorded (the W8-A caller-error
 * discipline).
 */

import type { RankedCandidateProgram } from "@mos/production";

import type {
  LabToStudioEntryRequest,
} from "./contracts/lab-to-studio-entry.js";
import type { ValidatedEntryOutcome } from "./bridge-validation.js";
import {
  isCanonicalStringRef,
  isFiniteNumber,
  isPositiveInteger,
  isPureData,
  isRecord,
} from "./validation-guards.js";

// ---------------------------------------------------------------------------
// The candidate validation (never a raw caller-claimed shape)
// ---------------------------------------------------------------------------

/** Identity-check the candidate against the result's OWN entries. */
export function candidateBelongsToResult(
  selected: RankedCandidateProgram,
  result: LabToStudioEntryRequest["searchResult"],
): boolean {
  if (result.noopBaseline === selected) {
    return true;
  }
  return Array.isArray(result.ranked) && result.ranked.some((entry) => entry === selected);
}

export function validateCandidate(request: LabToStudioEntryRequest): ValidatedEntryOutcome | null {
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
    if (!isRecord(step) || !isCanonicalStringRef(step.definitionId) || !isPositiveInteger(step.definitionVersion)) {
      return { ok: false, failure: { kind: "unversioned-candidate", reason: "every transform chain step must pin definitionId @ exact positive version" } };
    }
  }
  if (!isCanonicalStringRef(candidate.studioFormat)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.studioFormat is missing" } };
  }
  // The candidate's rank is carried on the entry citation (D5 finite guard).
  if (!isPositiveInteger(selected.rank)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.rank must be a positive integer (the search's deterministic 1-based order)" } };
  }

  // The canonical composed request: required fields, versioned, provenance'd.
  const composed = selected.request;
  if (!isRecord(composed)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "candidate.request (the canonical ProductionRequest) is missing" } };
  }
  if (!isCanonicalStringRef(composed.id)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request id is missing" } };
  }
  if (!isPositiveInteger(composed.version)) {
    return { ok: false, failure: { kind: "unversioned-candidate", reason: "canonical request version must be a positive integer" } };
  }
  if (!isRecord(composed.scope) || !isCanonicalStringRef(composed.scope.tenantId)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request scope.tenantId is missing (§31)" } };
  }
  if (composed.scope.tenantId !== request.scope.tenantId) {
    return {
      ok: false,
      failure: {
        kind: "tenant-mismatch",
        reason: `the candidate's request scope (tenant "${String(composed.scope.tenantId)}") does not match the entry scope (tenant "${String(request.scope.tenantId)}") — cross-tenant entries are denied`,
      },
    };
  }
  if (searchResult.tenantId !== request.scope.tenantId) {
    return {
      ok: false,
      failure: {
        kind: "tenant-mismatch",
        reason: `the search result's tenant "${String(searchResult.tenantId)}" does not match the entry scope (tenant "${String(request.scope.tenantId)}")`,
      },
    };
  }
  if (!isCanonicalStringRef(searchResult.id)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "searchResult.id is missing (the §30 request id the entry citation pins)" } };
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
  if (!isCanonicalStringRef(composed.organizationRef) || composed.organizationRef !== candidate.organization.organizationId) {
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
    if (!isRecord(source) || !isCanonicalStringRef(source.artifactId)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every source artifact must carry an artifactId" } };
    }
    if (source.storageRef !== undefined && !isCanonicalStringRef(source.storageRef)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every source artifact storageRef, when present, must be a non-blank string" } };
    }
  }
  if (!isRecord(composed.rightsContext) || !Array.isArray(composed.rightsContext.rightsRefs)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request rightsContext.rightsRefs is missing" } };
  }
  if (composed.rightsContext.rightsRefs.length === 0) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "the rights frame must cite at least one explicit grant (§27 — no frameless production)" } };
  }
  for (const ref of composed.rightsContext.rightsRefs) {
    if (!isCanonicalStringRef(ref)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every rightsContext.rightsRefs member must be a non-blank string ref" } };
    }
  }
  if (!Array.isArray(composed.rightsContext.consentRefs)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request rightsContext.consentRefs is missing" } };
  }
  for (const ref of composed.rightsContext.consentRefs) {
    if (!isCanonicalStringRef(ref)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every rightsContext.consentRefs member must be a non-blank string ref" } };
    }
  }
  // Projection totality (the W10-F3 discipline): the studio-request view
  // maps/spreads/JSON-encodes these canonical fields — each must be the
  // array/record/pure-data shape the projection consumes, so a hostile
  // payload fails CLOSED TYPED here instead of crashing untyped inside the
  // projection (canonical requests are pure data).
  if (!isCanonicalStringRef(composed.objective)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request objective is missing" } };
  }
  if (!isCanonicalStringRef(composed.strategyRef)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request strategyRef is missing" } };
  }
  if (!isCanonicalStringRef(composed.transformGraphRef)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request transformGraphRef is missing" } };
  }
  if (!Array.isArray(composed.capabilityRequirements)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request capabilityRequirements is missing" } };
  }
  for (const requirement of composed.capabilityRequirements) {
    if (!isRecord(requirement) || !isCanonicalStringRef(requirement.capabilityId)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every capability requirement must carry a capabilityId" } };
    }
  }
  if (!Array.isArray(composed.humanTasks)) {
    return { ok: false, failure: { kind: "malformed-candidate", reason: "canonical request humanTasks is missing" } };
  }
  for (const taskRef of composed.humanTasks) {
    if (!isCanonicalStringRef(taskRef)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: "every human task ref must be a non-blank string" } };
    }
  }
  const OPAQUE_REF_PROJECTIONS: readonly [string, unknown][] = [
    ["acceptanceCriteria", composed.acceptanceCriteria],
    ["delayPolicy", composed.delayPolicy],
    ["rightsContext", composed.rightsContext],
    ["returnContract", composed.returnContract],
  ];
  for (const [field, value] of OPAQUE_REF_PROJECTIONS) {
    if (value === undefined || value === null) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: `canonical request ${field} is missing` } };
    }
    if (!isPureData(value)) {
      return { ok: false, failure: { kind: "malformed-candidate", reason: `canonical request ${field} must be pure data (cyclic/non-serializable payloads never enter studio production)` } };
    }
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
  for (const dimension of provenance.variedDimensions) {
    if (!isCanonicalStringRef(dimension)) {
      return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "every variedDimensions member must be a non-blank string dimension" } };
    }
  }
  if (!isCanonicalStringRef(provenance.origin)) {
    return { ok: false, failure: { kind: "unprovenanced-candidate", reason: "provenance.origin is missing (the search's own origin vocabulary)" } };
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

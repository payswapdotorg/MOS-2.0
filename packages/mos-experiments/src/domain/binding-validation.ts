/**
 * BRIDGE-003 fail-closed binding-request validation (pure logic — the
 * BRIDGE-001 candidate-validation discipline).
 *
 * INTAKE validates the request's SHAPE only (scope, actor, citations,
 * window, distribution citation, measurement labels). The PRODUCTION
 * citation validation (candidate-in-result, version pins, tenant match,
 * no-op-baseline rejection) runs at its own §24 stage (after the rights
 * gate — the stage order the work item pins), in
 * adapters/binding-core.ts. No clocks, no IO, no authority calls — a
 * caller-shape failure records NOTHING (the W8-A discipline).
 */

import type { RealExperimentBindingRequest } from "../contracts/binding-request.js";
import { isValidIsoTimestamp } from "./digest.js";

/** Non-blank string check (blank ≡ missing — fail closed, never defaulted). */
const isNonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Positive integer check (version pins — never "latest", never 0). */
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * Every named reason the request SHAPE is invalid (empty = valid). Named
 * reasons ride the typed `invalid-binding-request` failure verbatim.
 */
export function bindingRequestShapeViolations(
  request: RealExperimentBindingRequest,
): readonly string[] {
  const violations: string[] = [];
  if (request === null || typeof request !== "object") {
    return ["the binding request must be an object"];
  }
  // — scope + actor (§31/§30) —
  const scope = (request as { scope?: unknown }).scope;
  if (scope === null || typeof scope !== "object" || !isNonBlank((scope as { tenantId?: unknown }).tenantId)) {
    violations.push("scope.tenantId is required (§31 — experiments are tenant-scoped)");
  }
  if (!isNonBlank((request as { actor?: unknown }).actor)) {
    violations.push("actor is required (§30 — the binding principal)");
  }
  // — lab candidate citation —
  const labCandidate = (request as { labCandidate?: unknown }).labCandidate;
  if (labCandidate === null || typeof labCandidate !== "object") {
    violations.push("labCandidate is required (the selected LAB-017 candidate citation)");
  } else {
    const citation = labCandidate as Record<string, unknown>;
    if (!isNonBlank(citation.benchmarkId)) {
      violations.push("labCandidate.benchmarkId must be a non-blank string (the benchmark record chain id)");
    }
    if (!isPositiveInteger(citation.benchmarkVersion)) {
      violations.push("labCandidate.benchmarkVersion must be a positive integer (the EXACT record version, never 'latest')");
    }
    if (!isNonBlank(citation.candidateKey)) {
      violations.push("labCandidate.candidateKey must be a non-blank string (a key in the record's ranked set)");
    }
  }
  // — mission citation —
  const mission = (request as { mission?: unknown }).mission;
  if (mission === null || typeof mission !== "object") {
    violations.push("mission is required (the §24 Mission segment citation)");
  } else {
    if (!isNonBlank((mission as Record<string, unknown>).missionRef)) {
      violations.push("mission.missionRef must be a non-blank string ref");
    }
    if (!isPositiveInteger((mission as Record<string, unknown>).missionVersion)) {
      violations.push("mission.missionVersion must be a positive integer (the EXACT record version)");
    }
  }
  // — policy citation set —
  const policy = (request as { policy?: unknown }).policy;
  if (!Array.isArray(policy) || policy.length === 0) {
    violations.push("policy must be a non-empty array of exact-version rule citations (an empty set fails closed)");
  } else {
    for (const [index, entry] of policy.entries()) {
      if (entry === null || typeof entry !== "object") {
        violations.push(`policy[${index}] must be an {id, version} citation`);
        continue;
      }
      const citation = entry as Record<string, unknown>;
      if (!isNonBlank(citation.id)) {
        violations.push(`policy[${index}].id must be a non-blank rule ref`);
      }
      if (!isPositiveInteger(citation.version)) {
        violations.push(`policy[${index}].version must be a positive integer (the EXACT rule version)`);
      }
    }
  }
  // — rights frame —
  const rightsFrame = (request as { rightsFrame?: unknown }).rightsFrame;
  if (rightsFrame === null || typeof rightsFrame !== "object") {
    violations.push("rightsFrame is required (the declared rights frame)");
  } else {
    const frame = rightsFrame as Record<string, unknown>;
    const rightsRefs = frame.rightsRefs;
    if (!Array.isArray(rightsRefs) || rightsRefs.length === 0) {
      violations.push("rightsFrame.rightsRefs must be a non-empty array (§27 — no frameless experiment)");
    } else {
      for (const [index, ref] of (rightsRefs as unknown[]).entries()) {
        if (!isNonBlank(ref)) {
          violations.push(`rightsFrame.rightsRefs[${index}] must be a non-blank grant ref`);
        }
      }
    }
    const consentRefs = frame.consentRefs;
    if (!Array.isArray(consentRefs)) {
      violations.push("rightsFrame.consentRefs must be an array (possibly empty)");
    } else {
      for (const [index, ref] of (consentRefs as unknown[]).entries()) {
        if (!isNonBlank(ref)) {
          violations.push(`rightsFrame.consentRefs[${index}] must be a non-blank consent ref`);
        }
      }
    }
  }
  // — production citation (shape level: presence + basic fields) —
  const production = (request as { production?: unknown }).production;
  if (production === null || typeof production !== "object") {
    violations.push("production is required (the REAL search result + the selected candidate)");
  } else {
    const prod = production as Record<string, unknown>;
    if (prod.searchResult === null || typeof prod.searchResult !== "object") {
      violations.push("production.searchResult is required (the REAL ProductionProgramSearchResult)");
    }
    if (prod.selected === null || typeof prod.selected !== "object") {
      violations.push("production.selected is required (the result's own ranked entry)");
    }
  }
  // — distribution citation —
  const distribution = (request as { distribution?: unknown }).distribution;
  if (distribution === null || typeof distribution !== "object") {
    violations.push("distribution is required (the platform-confirmed publication citation)");
  } else {
    const dist = distribution as Record<string, unknown>;
    if (!isNonBlank(dist.publicationId)) {
      violations.push("distribution.publicationId must be a non-blank string (the REAL publication record id)");
    }
    const expectedArtifact = dist.expectedArtifact;
    if (expectedArtifact === null || typeof expectedArtifact !== "object") {
      violations.push("distribution.expectedArtifact is required (what the caller says was distributed)");
    } else {
      const artifact = expectedArtifact as Record<string, unknown>;
      if (!isNonBlank(artifact.artifactId)) {
        violations.push("distribution.expectedArtifact.artifactId must be a non-blank string");
      }
      if (!isPositiveInteger(artifact.version)) {
        violations.push("distribution.expectedArtifact.version must be a positive integer (the EXACT artifact version)");
      }
    }
  }
  // — measurement window + context labels —
  const measurement = (request as { measurement?: unknown }).measurement;
  if (measurement === null || typeof measurement !== "object") {
    violations.push("measurement is required (the declared window + context labels)");
  } else {
    const window = measurement as Record<string, unknown>;
    if (!isNonBlank(window.windowStart) || !isValidIsoTimestamp(String(window.windowStart ?? ""))) {
      violations.push("measurement.windowStart must be a valid ISO-8601 timestamp");
    }
    if (!isNonBlank(window.windowEnd) || !isValidIsoTimestamp(String(window.windowEnd ?? ""))) {
      violations.push("measurement.windowEnd must be a valid ISO-8601 timestamp");
    }
    if (
      isNonBlank(window.windowStart) &&
      isNonBlank(window.windowEnd) &&
      isValidIsoTimestamp(String(window.windowStart)) &&
      isValidIsoTimestamp(String(window.windowEnd)) &&
      Date.parse(String(window.windowEnd)) <= Date.parse(String(window.windowStart))
    ) {
      violations.push("measurement.windowEnd must be strictly after windowStart");
    }
    if (!isNonBlank(window.niche)) {
      violations.push("measurement.niche must be a non-blank string (the declared real-world niche label)");
    }
    if (!isNonBlank(window.regime)) {
      violations.push("measurement.regime must be a non-blank string (the declared regime label)");
    }
  }
  // — finite guard helper exported for the core (W9-B D5: every numeric the
  //   records carry is guarded at intake — the lab seam's expectations are
  //   validated by the core at resolution time) —
  return violations;
}

// ---------------------------------------------------------------------------
// The PRODUCTION-stage citation validation (§24 order: after the rights gate)
// ---------------------------------------------------------------------------

/**
 * The production-citation validation of the §24 chain's Production segment
 * (the BRIDGE-001 candidate-validation discipline, adapted): the selected
 * candidate must be the search result's OWN ranked entry (ranked set or
 * the structural baseline — a lookalike object fails closed), versioned,
 * canonically-requested, tenant-consistent. The synthesized no-op baseline
 * is the search's own comparison entry and is NOT experiment-bindable.
 * Returns `null` when valid, or the production-stage failure (kind +
 * verbatim reason) when invalid.
 */
export function productionCitationFailure(
  request: RealExperimentBindingRequest,
): { kind: "malformed-production-candidate" | "unversioned-production-candidate" | "candidate-not-in-result" | "no-op-baseline-not-experiment-bindable" | "production-tenant-mismatch"; reason: string } | null {
  const { searchResult, selected } = request.production;
  if (selected === null || typeof selected !== "object") {
    return { kind: "malformed-production-candidate", reason: "the selected candidate is missing" };
  }
  const rank = (selected as { rank?: unknown }).rank;
  if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) {
    return { kind: "malformed-production-candidate", reason: "the selected candidate's rank must be a positive integer (the search's deterministic 1-based order)" };
  }
  const request_ = (selected as { request?: unknown }).request;
  if (request_ === null || typeof request_ !== "object") {
    return { kind: "malformed-production-candidate", reason: "candidate.request (the canonical ProductionRequest) is missing" };
  }
  const canonical = request_ as Record<string, unknown>;
  const id = (canonical as { id?: unknown }).id;
  if (typeof id !== "string" || id.trim() === "") {
    return { kind: "malformed-production-candidate", reason: "canonical request id is missing" };
  }
  const version = (canonical as { version?: unknown }).version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { kind: "unversioned-production-candidate", reason: "canonical request version must be a positive integer" };
  }
  const requestScope = (canonical as { scope?: unknown }).scope;
  const requestTenantId =
    requestScope !== null && typeof requestScope === "object"
      ? (requestScope as { tenantId?: unknown }).tenantId
      : undefined;
  if (typeof requestTenantId !== "string" || requestTenantId.trim() === "") {
    return { kind: "malformed-production-candidate", reason: "canonical request scope.tenantId is missing (§31)" };
  }
  if (String(requestTenantId) !== String(request.scope.tenantId)) {
    return { kind: "production-tenant-mismatch", reason: `canonical request tenant ${String(requestTenantId)} does not match the binding scope tenant ${String(request.scope.tenantId)} (§31)` };
  }
  // The result's OWN entries: IDENTITY comparison (the BRIDGE-001
  // discipline — a lookalike object is a DIFFERENT object and fails closed).
  if ((selected.candidate as { isNoopBaseline?: unknown } | undefined)?.isNoopBaseline === true) {
    return {
      kind: "no-op-baseline-not-experiment-bindable",
      reason: "the selected candidate declares itself the no-op baseline — a real experiment binds a SELECTED declared candidate (§7/§24)",
    };
  }
  const inRanked =
    Array.isArray(searchResult.ranked) &&
    searchResult.ranked.some((entry) => entry === (selected as unknown));
  const isBaseline = searchResult.noopBaseline === (selected as unknown);
  if (isBaseline && !inRanked) {
    return {
      kind: "no-op-baseline-not-experiment-bindable",
      reason: "the no-op baseline is the search's own synthesized comparison entry — a real experiment binds a SELECTED declared candidate (§7/§24; the no-op's real-world measurement is the counterfactual comparison carried on the experiment, never a separate binding)",
    };
  }
  if (!inRanked && !isBaseline) {
    return {
      kind: "candidate-not-in-result",
      reason: "the selected candidate is not one of the cited search result's own entries — a lookalike object is rejected fail-closed (identity comparison, the BRIDGE-001 discipline)",
    };
  }
  return null;
}

/** Finite-number guard for the resolved lab expectations (W9-B D5). */
export const isFiniteNumberGuard = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
/**
 * BRIDGE-002 fail-closed intake validation — the typed §19 evaluation gate.
 *
 * A §19 decision enters the authority ONLY as a well-formed
 * `StudioOutputEvaluationRequest` whose decision kind is a member of the
 * CLOSED ten-kind §19 vocabulary and whose payload matches the kind's shape
 * (kind↔payload correlation, hostile shapes rejected, every numeric
 * finite-guarded (W9-B D5), every payload pure-data (W10-F3)). Malformed,
 * unknown-kind or out-of-vocabulary shapes fail closed with typed failures
 * BEFORE any authority consultation — nothing attributable happened, so
 * nothing is recorded (the W8-A caller-error discipline).
 *
 * The treatment-kind vocabulary is COMPILE-PINNED to the studio's own REAL
 * `TreatmentKind` union (contracts/treatment.ts — no drift possible): a
 * request-treatment directive may only name a treatment the studio side can
 * actually execute through its organization.
 */

import type { TreatmentKind } from "../../contracts/treatment.js";
import type { StudioOutputEvaluationRequest } from "./contracts/studio-output-evaluation.js";
import type { StudioOutputEvaluationFailure } from "./contracts/studio-output-evaluation.js";
import { STUDIO_EVALUATION_DECISION_KIND_SET } from "./contracts/studio-output-evaluation.js";
import {
  isCanonicalStringRef,
  isFiniteNumber,
  isPositiveInteger,
  isPureData,
  isRecord,
  nonBlank,
} from "../validation-guards.js";

// ---------------------------------------------------------------------------
// The compile-pinned treatment-kind vocabulary (the studio's own union)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;

/** Every REAL `TreatmentKind` member (compile-pinned — the no-drift pin). */
const TREATMENT_KIND_VOCABULARY = [
  "edit",
  "trim",
  "adjust-composition",
  "regenerate-segment",
  "re-render",
  "re-transcribe",
  "re-caption",
] as const satisfies readonly TreatmentKind[];

type ExhaustiveTreatmentKinds =
  TreatmentKind extends (typeof TREATMENT_KIND_VOCABULARY)[number]
    ? (typeof TREATMENT_KIND_VOCABULARY)[number] extends TreatmentKind
      ? true
      : never
    : never;
type _TreatmentKindVocabularyIsExact = Expect<ExhaustiveTreatmentKinds>;

/** The intake gate's closed treatment-kind set (compiled from the vocabulary). */
const TREATMENT_KINDS = new Set<string>(TREATMENT_KIND_VOCABULARY);

// ---------------------------------------------------------------------------
// The validated projection (what the authority core consumes onward)
// ---------------------------------------------------------------------------

/** The validated projection of one §19 evaluation request. */
export type ValidatedStudioOutputEvaluation =
  | { readonly ok: true; readonly value: StudioOutputEvaluationRequest }
  | { readonly ok: false; readonly failure: StudioOutputEvaluationFailure };

// ---------------------------------------------------------------------------
// The frame validation (caller shape errors — nothing recorded)
// ---------------------------------------------------------------------------

function invalidRequest(reason: string): ValidatedStudioOutputEvaluation {
  return { ok: false, failure: { kind: "invalid-evaluation-request", reason } };
}

function validateFrame(request: StudioOutputEvaluationRequest): ValidatedStudioOutputEvaluation | null {
  if (!isRecord(request) || !isRecord(request.scope) || !isCanonicalStringRef(request.scope.tenantId)) {
    return invalidRequest("scope.tenantId must be a non-blank string primitive (§31 tenant scoping — a coerced object is never a tenant id)");
  }
  if (!isCanonicalStringRef(request.actor)) {
    return invalidRequest("actor must be a non-blank string IdentityRef primitive (§30 observability)");
  }
  if (!isCanonicalStringRef(request.entryId)) {
    return invalidRequest("entryId must be a non-blank string (the BRIDGE-001 entry chain id)");
  }
  if (request.entryVersion !== undefined && !isPositiveInteger(request.entryVersion)) {
    return invalidRequest("entryVersion, when cited, must be a positive integer (exact-version citations — never 'latest' by accident)");
  }
  if (!isRecord(request.evaluatedPackage)) {
    return invalidRequest("evaluatedPackage must carry the evaluated package citation (packageId @ exact version)");
  }
  if (!isCanonicalStringRef(request.evaluatedPackage.packageId)) {
    return invalidRequest("evaluatedPackage.packageId must be a non-blank string primitive");
  }
  if (!isPositiveInteger(request.evaluatedPackage.version)) {
    return invalidRequest("evaluatedPackage.version must be a positive integer (EXACT version — never 'latest')");
  }
  if (request.notes !== undefined && !nonBlank(request.notes)) {
    return invalidRequest("notes, when present, must be a non-blank string (carried verbatim, §30)");
  }
  if (!isPureData(request)) {
    return invalidRequest("the evaluation request must be pure data (cyclic/non-serializable payloads never enter §19 evaluation)");
  }
  return null;
}

// ---------------------------------------------------------------------------
// The decision payload validation (kind ↔ payload correlation)
// ---------------------------------------------------------------------------

function payloadFailure(reason: string): ValidatedStudioOutputEvaluation {
  return { ok: false, failure: { kind: "invalid-decision-payload", reason } };
}

function validateRouting(
  routing: unknown,
  kind: string,
): ValidatedStudioOutputEvaluation | null {
  if (!isRecord(routing)) {
    return payloadFailure(`the ${kind} decision must carry a routing citation (the Lab/production search surface, BY REFERENCE)`);
  }
  if (!nonBlank(routing.rationale)) {
    return payloadFailure(`the ${kind} routing must carry a non-blank rationale`);
  }
  if (!isCanonicalStringRef(routing.missionRef)) {
    return payloadFailure(`the ${kind} routing must cite the mission whose Lab surface it returns to`);
  }
  if (!isCanonicalStringRef(routing.searchResultId)) {
    return payloadFailure(`the ${kind} routing must cite the search result it returns to (the original or a re-run)`);
  }
  return null;
}

/** Validate the §19 decision payload against its kind's exact shape. */
export function validateDecisionPayload(
  decision: unknown,
  evaluatedPackage: { readonly packageId: string; readonly version: number },
): ValidatedStudioOutputEvaluation | null {
  if (!isRecord(decision)) {
    return payloadFailure("decision must be a record carrying the §19 kind + payload");
  }
  const kind = decision.kind;
  if (typeof kind !== "string") {
    return payloadFailure("decision.kind must be a string member of the closed ten-kind §19 vocabulary");
  }
  if (!STUDIO_EVALUATION_DECISION_KIND_SET.has(kind)) {
    return {
      ok: false,
      failure: {
        kind: "decision-kind-out-of-vocabulary",
        reason: `decision.kind "${kind}" is outside the closed ten-kind §19 vocabulary (accept; reject-quality; reject-strategy; request-treatment; require-human-action; switch-organization; switch-transform; switch-engine; accept-alternate-output; abandon) — rights/policy rejections are NOT evaluation kinds (§19: they belong to the §24 gate chain)`,
      },
    };
  }
  switch (kind) {
    case "accept": {
      if (!nonBlank(decision.summary)) {
        return payloadFailure("the accept decision must carry a non-blank evaluation summary");
      }
      return null;
    }
    case "reject-quality": {
      if (!Array.isArray(decision.failedCriteria) || decision.failedCriteria.length === 0) {
        return payloadFailure("the reject-quality decision must name at least one failed acceptance criterion");
      }
      for (const criterion of decision.failedCriteria) {
        if (!nonBlank(criterion)) {
          return payloadFailure("every failed criterion must be a non-blank string");
        }
      }
      if (!nonBlank(decision.rationale)) {
        return payloadFailure("the reject-quality decision must carry a non-blank rationale");
      }
      return null;
    }
    case "reject-strategy": {
      if (!nonBlank(decision.rationale)) {
        return payloadFailure("the reject-strategy decision must carry a non-blank rationale (the strategy-level failure)");
      }
      return null;
    }
    case "request-treatment": {
      const treatment = decision.treatment;
      if (!isRecord(treatment)) {
        return payloadFailure("the request-treatment decision must carry a treatment directive");
      }
      if (typeof treatment.kind !== "string" || !TREATMENT_KINDS.has(treatment.kind)) {
        return payloadFailure(`treatment.kind "${String(treatment.kind)}" is outside the studio's own closed treatment vocabulary (edit; trim; adjust-composition; regenerate-segment; re-render; re-transcribe; re-caption)`);
      }
      if (treatment.parametersRef !== undefined && !isCanonicalStringRef(treatment.parametersRef)) {
        return payloadFailure("treatment.parametersRef, when present, must be a non-blank string (out-of-line parameters — no media over control RPC)");
      }
      if (!nonBlank(treatment.rationale)) {
        return payloadFailure("the request-treatment directive must carry a non-blank rationale");
      }
      return null;
    }
    case "require-human-action": {
      const humanAction = decision.humanAction;
      if (!isRecord(humanAction)) {
        return payloadFailure("the require-human-action decision must carry a human-action routing");
      }
      if (!nonBlank(humanAction.objective)) {
        return payloadFailure("the require-human-action routing must carry a non-blank objective");
      }
      if (!nonBlank(humanAction.rationale)) {
        return payloadFailure("the require-human-action routing must carry a non-blank rationale");
      }
      const taskPackage = humanAction.referencedTaskPackage;
      if (taskPackage !== undefined) {
        if (!isRecord(taskPackage) || !isCanonicalStringRef(taskPackage.id) || !isPositiveInteger(taskPackage.version)) {
          return payloadFailure("referencedTaskPackage, when cited, must carry a non-blank id and an exact positive integer version (LAB-014 citation, BY REFERENCE)");
        }
      }
      return null;
    }
    case "switch-organization":
    case "switch-transform":
    case "switch-engine":
      return validateRouting(decision.routing, kind);
    case "accept-alternate-output": {
      const alternate = decision.alternate;
      if (!isRecord(alternate)) {
        return payloadFailure("the accept-alternate-output decision must carry the alternate package citation");
      }
      if (!isCanonicalStringRef(alternate.packageId)) {
        return payloadFailure("the alternate package citation must carry a non-blank packageId");
      }
      if (!isPositiveInteger(alternate.version)) {
        return payloadFailure("the alternate package citation must pin an exact positive integer version");
      }
      if (
        String(alternate.packageId) === String(evaluatedPackage.packageId) &&
        alternate.version === evaluatedPackage.version
      ) {
        return payloadFailure("the alternate output cannot be the evaluated package version itself — cite a different studio output");
      }
      return null;
    }
    case "abandon": {
      if (!nonBlank(decision.justification)) {
        return payloadFailure("the abandon decision must carry a non-blank justification (§18 — abandoned branches stay auditable)");
      }
      const analysis = decision.analysis;
      if (!isRecord(analysis)) {
        return payloadFailure("the abandon decision must carry its justifying analysis snapshot (§18 first-class abandon)");
      }
      if (!nonBlank(analysis.summary)) {
        return payloadFailure("the analysis snapshot must carry a non-blank summary");
      }
      const analysisRef = analysis.analysisRef;
      if (
        !isRecord(analysisRef) ||
        !isCanonicalStringRef(analysisRef.analysisId) ||
        !isPositiveInteger(analysisRef.analysisVersion)
      ) {
        return payloadFailure("the analysis snapshot must cite the Lab's own analysis record (analysisId @ exact version, BY REFERENCE — feeds LAB-017/018)");
      }
      const delayEconomics = analysis.delayEconomics;
      if (delayEconomics !== undefined) {
        if (
          !isRecord(delayEconomics) ||
          !isFiniteNumber(delayEconomics.expectedIncrementalValue) ||
          !isFiniteNumber(delayEconomics.estimatedWaitMs) ||
          !isFiniteNumber(delayEconomics.delayCost)
        ) {
          return payloadFailure("the §18 delay-economics figures, when present, must all be finite (W9-B D5)");
        }
      }
      return null;
    }
    default:
      return payloadFailure(`decision.kind "${kind}" is a closed-vocabulary member with no payload validator — an authority defect (never a caller error)`);
  }
}

// ---------------------------------------------------------------------------
// The public validation entry point
// ---------------------------------------------------------------------------

/**
 * Validate one §19 evaluation request fail-closed. Returns the validated
 * request (frame + decision payload) or a typed caller-shape failure
 * (nothing attributable — nothing is recorded).
 */
export function validateStudioOutputEvaluation(
  request: StudioOutputEvaluationRequest,
): ValidatedStudioOutputEvaluation {
  const frameFailure = validateFrame(request);
  if (frameFailure !== null) {
    return frameFailure;
  }
  const decisionFailure = validateDecisionPayload(request.decision, request.evaluatedPackage);
  if (decisionFailure !== null) {
    return decisionFailure;
  }
  return { ok: true, value: request };
}

/**
 * BRIDGE-001 canonical-request → studio-request-view projections (extracted
 * from lab-to-studio-bridge.ts — the file-length policy, behavior-identical).
 *
 * The studio's `StudioProductionRequestView` is the studio-side READ-ONLY
 * consumption view of the canonical CORE-001 `ProductionRequest`; the
 * projections below are documented and coarse ONLY where the studio's own
 * opaque branded refs are involved: the canonical acceptance/delay/rights/
 * return data rides those refs JSON-ENCODED VERBATIM (no lossy projection —
 * the full canonical data travels with the session), and the canonical
 * numeric budget amount is formatted into the studio's decimal-string money
 * form. The validation layer (bridge-validation.ts /
 * candidate-validation.ts) guarantees every projected field is pure data
 * BEFORE these projections run (the W10-F3 discipline).
 */

import type {
  AcceptanceCriteriaRef,
  DelayPolicyRef,
  LabCandidateRef,
  ReturnContractRef,
  RightsRef,
} from "../contracts/refs.js";
import type { StudioOrganizationRef } from "../contracts/organization-loading.js";
import type { StudioProductionRequestView } from "../contracts/studio-session.js";
import type { ValidatedLabToStudioEntry } from "./bridge-validation.js";

// ---------------------------------------------------------------------------
// Documented coarse projections (canonical request → studio request view)
// ---------------------------------------------------------------------------

/**
 * Compile-time brand bridge (the W10-C disclosed pattern): the studio's
 * opaque cross-authority refs are branded strings; the canonical values are
 * JSON-encoded into them verbatim (no lossy projection — the full canonical
 * data rides the opaque ref).
 */
const asOpaqueRef = <T>(value: string): T => value as T;

/** The canonical numeric amount → the studio's decimal-string money form. */
export function canonicalAmountToStudioDecimal(amount: number): string {
  const fixed = amount.toFixed(2);
  return fixed.includes("e") || fixed.includes("E") ? String(amount) : fixed;
}

/** Project the canonical composed request into the studio's request view. */
export function projectStudioRequestView(
  validated: ValidatedLabToStudioEntry,
  formatVersion: number,
): StudioProductionRequestView {
  const request = validated.request;
  const scopeTag = String(request.id);
  return {
    id: request.id,
    version: request.version,
    scope: String(request.scope.tenantId),
    objective: request.objective,
    sourceArtifacts: request.sourceArtifacts.map((source) => source.artifactId),
    strategyRef: request.strategyRef,
    transformGraphRef: request.transformGraphRef,
    organizationRef: {
      id: request.organizationRef as StudioOrganizationRef["id"],
      version: validated.organizationCitation.organizationVersion,
    },
    studioFormat: { formatId: request.studioFormat, version: formatVersion },
    capabilityRequirements: request.capabilityRequirements.map((requirement) => requirement.capabilityId),
    humanTasks: [...request.humanTasks],
    acceptanceCriteria: asOpaqueRef<AcceptanceCriteriaRef>(
      `lab-entry:acceptance:${scopeTag}:${JSON.stringify(request.acceptanceCriteria)}`,
    ),
    budget: {
      limit: {
        currency: request.budget.maxCost.currency,
        amount: canonicalAmountToStudioDecimal(request.budget.maxCost.amount),
      },
    },
    deadline: request.deadline,
    delayPolicy: asOpaqueRef<DelayPolicyRef>(
      `lab-entry:delay-policy:${scopeTag}:${JSON.stringify(request.delayPolicy)}`,
    ),
    rightsContext: asOpaqueRef<RightsRef>(
      `lab-entry:rights-context:${scopeTag}:${JSON.stringify(request.rightsContext)}`,
    ),
    returnContract: asOpaqueRef<ReturnContractRef>(
      `lab-entry:return-contract:${scopeTag}:${JSON.stringify(request.returnContract)}`,
    ),
  };
}

/** The deterministic lab-candidate citation the studio session records. */
export function labCandidateRefOf(searchResultId: string, rank: number): LabCandidateRef {
  return JSON.stringify(["lab-candidate", searchResultId, rank]) as LabCandidateRef;
}

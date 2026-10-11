/**
 * COMMERCE-001 — fail-closed validation (first-error-out, specific codes;
 * never a collapsed "UNKNOWN_ERROR").
 */
import { isValidTenantId } from "@mos/contracts";
import type { TenantId } from "@mos/contracts";
import type {
  CommerceDiscoveryError,
  DemandTestDeclaration,
  ProvenanceSource,
} from "./types.js";

const err = (
  code: CommerceDiscoveryError["code"],
  message: string,
): CommerceDiscoveryError => ({ code, message });

const isNonBlank = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

export const validateTenantId = (
  tenantId: TenantId,
): CommerceDiscoveryError | null =>
  isValidTenantId(tenantId)
    ? null
    : err("INVALID_TENANT", `invalid tenant id: ${String(tenantId)}`);

export const validateProvenance = (
  provenance: ReadonlyArray<ProvenanceSource>,
): CommerceDiscoveryError | null => {
  if (!Array.isArray(provenance) || provenance.length === 0) {
    return err(
      "PROVENANCE_REQUIRED",
      "discovery candidates carry provenance: at least one cited product-intelligence source is required",
    );
  }
  for (const source of provenance) {
    if (!source || !isNonBlank(String(source.sourceRef ?? ""))) {
      return err(
        "INVALID_PROVENANCE",
        "each provenance source must cite an exact product-intelligence version ref",
      );
    }
    if (!source.citation || typeof source.citation !== "object") {
      return err(
        "INVALID_PROVENANCE",
        "each provenance source must carry its commerce observation citation",
      );
    }
  }
  return null;
};

export const validateDemandTest = (
  declaration: DemandTestDeclaration,
): CommerceDiscoveryError | null => {
  if (!declaration || typeof declaration !== "object") {
    return err("INVALID_DEMAND_TEST", "a demand-test declaration is required");
  }
  const { mission, question, successCriterion, evidence } = declaration;
  if (
    !mission ||
    !isNonBlank(String(mission.missionRef ?? "")) ||
    !Number.isInteger(mission.missionVersion) ||
    (mission.missionVersion ?? 0) < 1
  ) {
    return err(
      "INVALID_DEMAND_TEST",
      "the demand test must cite an exact mission ref + version (>= 1)",
    );
  }
  if (!isNonBlank(question)) {
    return err("INVALID_DEMAND_TEST", "the demand-test question is required");
  }
  if (!isNonBlank(successCriterion)) {
    return err(
      "INVALID_DEMAND_TEST",
      "the declared success criterion is required",
    );
  }
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return err(
      "INVALID_DEMAND_TEST",
      "the demand-test expectation must cite >= 1 product-intelligence version ref",
    );
  }
  if (typeof declaration.counterfactualLabeled !== "boolean") {
    return err(
      "INVALID_DEMAND_TEST",
      "the counterfactual label must be explicit (forecasts are counterfactual-labeled)",
    );
  }
  return null;
};

/** Whole-record validation — first failure wins (fail-closed, specific). */
export const validateCommerceDiscoveryRecord = (
  record: {
    tenantId: TenantId;
    provenance: ReadonlyArray<ProvenanceSource>;
    demandTest: DemandTestDeclaration;
  },
): CommerceDiscoveryError | null =>
  validateTenantId(record.tenantId) ??
  validateProvenance(record.provenance) ??
  validateDemandTest(record.demandTest);

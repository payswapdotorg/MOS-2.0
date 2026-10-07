/**
 * INTEG-001 test fixtures — PROVIDER DATA ONLY.
 *
 * ⚠ SEED/EXAMPLE DATA — NOT PROVIDER CLAIMS ⚠
 *
 * Every provider identity in these fixtures is FICTIONAL (aurora-social /
 * beacon-pay): no real provider, platform or vendor is named anywhere in
 * this package — not in code, not even in test data.
 * The fixtures exercise the four-layer structure with tenant-scoped DATA
 * records: definitions (with declared supported/unsupported/unknown
 * capability surfaces), implementations (status + evidence), instances
 * (credential HANDLES) and explicit availability capabilities.
 *
 * Capability ids are the architecture §5 example vocabulary of the REAL
 * @mos/capabilities seed catalog (transcribe_audio, generate_voice,
 * evaluate_content, detect_scenes) so fixture refs resolve through the
 * REAL capability registry the composition seam seeds.
 */

import type {
  CapabilityId,
  EvidenceRef,
  IdentityRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { RightsGrant } from "@mos/rights";

import type { RegisterProviderDefinitionInput } from "../contracts/provider-definition.js";
import type { RegisterProviderImplementationInput } from "../contracts/provider-implementation.js";
import type { RegisterMerchantClientInstanceInput } from "../contracts/merchant-client-instance.js";
import type { RegisterAvailabilityCapabilityInput } from "../contracts/availability-capability.js";

// ---------------------------------------------------------------------------
// Tenants / identities (data)
// ---------------------------------------------------------------------------

export const TENANT_ALPHA = "tenant-alpha" as TenantId;
export const TENANT_BETA = "tenant-beta" as TenantId;

export const SCOPE_ALPHA = { tenantId: TENANT_ALPHA } as TenantScope;
export const SCOPE_BETA = { tenantId: TENANT_BETA } as TenantScope;

export const MERCHANT_ONE = "identity:merchant-one" as IdentityRef;
export const MERCHANT_TWO = "identity:merchant-two" as IdentityRef;
export const ACTOR_ONE = "identity:actor-one" as IdentityRef;
export const ACTOR_TWO = "identity:actor-two" as IdentityRef;

// ---------------------------------------------------------------------------
// Capability refs (the REAL @mos/capabilities seed vocabulary, §5 examples)
// ---------------------------------------------------------------------------

export const CAP_TRANSCRIBE = "transcribe_audio" as CapabilityId;
export const CAP_GENERATE_VOICE = "generate_voice" as CapabilityId;
export const CAP_EVALUATE = "evaluate_content" as CapabilityId;
export const CAP_DETECT_SCENES = "detect_scenes" as CapabilityId;
export const CAP_VERSION_1 = 1 as Version;

// ---------------------------------------------------------------------------
// Layer 1 — provider definitions (fictional DATA)
// ---------------------------------------------------------------------------

/** Aurora Social: a fictional social platform with a MIXED declared surface. */
export const AURORA_DEFINITION_INPUT: RegisterProviderDefinitionInput = {
  scope: SCOPE_ALPHA,
  providerId: "provider:aurora-social" as RegisterProviderDefinitionInput["providerId"],
  displayName: "Aurora Social (fictional fixture)",
  kind: "social-platform",
  transport: {
    transportKind: "http-rest",
    authentication: { kind: "oauth2", managedBy: "integrations" },
    invocationContract: { type: "object", required: ["capability", "parameters"] },
  },
  declaredCapabilities: [
    { capabilityId: CAP_TRANSCRIBE, support: "supported" },
    { capabilityId: CAP_GENERATE_VOICE, support: "unknown" },
    { capabilityId: CAP_EVALUATE, support: "unsupported" },
    { capabilityId: CAP_DETECT_SCENES, support: "supported" },
  ],
};

/** Beacon Pay: a fictional payment processor declaring NO content capabilities. */
export const BEACON_DEFINITION_INPUT: RegisterProviderDefinitionInput = {
  scope: SCOPE_ALPHA,
  providerId: "provider:beacon-pay" as RegisterProviderDefinitionInput["providerId"],
  displayName: "Beacon Pay (fictional fixture)",
  kind: "payment-processor",
  transport: {
    transportKind: "http-rpc",
    authentication: { kind: "api-key", managedBy: "caller" },
    invocationContract: { type: "object", required: ["operation"] },
  },
  declaredCapabilities: [],
};

// ---------------------------------------------------------------------------
// Layer 2 — provider implementations (fictional DATA)
// ---------------------------------------------------------------------------

/** A status-unknown implementation of the Aurora definition (no evidence yet). */
export function auroraImplementationInput(
  definitionId: RegisterProviderImplementationInput["definitionId"],
): RegisterProviderImplementationInput {
  return {
    scope: SCOPE_ALPHA,
    definitionId,
    definitionVersion: 1 as Version,
    label: "primary",
    status: "unknown",
    evidenceRefs: [],
    evidenceModel: { shape: "provider-evidence-v1" },
    errorModel: { shape: "provider-errors-v1" },
    rateLimitObservation: {
      observedAt: "2026-01-01T00:00:00.000Z" as Timestamp,
      requestsPerWindow: 600,
      windowMs: 600_000,
    },
  };
}

/** Evidence refs used when correcting INTO positive statuses. */
export const EVIDENCE_HEALTH_CHECK = "evidence:health-check" as EvidenceRef;
export const EVIDENCE_BENCHMARK = "evidence:connector-benchmark" as EvidenceRef;

// ---------------------------------------------------------------------------
// Layer 3 — merchant/client instances (fictional DATA)
// ---------------------------------------------------------------------------

export const AURORA_EXTERNAL_ACCOUNT =
  "account:aurora-merchant-one" as RegisterMerchantClientInstanceInput["externalAccount"];

// ---------------------------------------------------------------------------
// Layer 4 — availability capabilities (fictional DATA)
// ---------------------------------------------------------------------------

/** Explicit availability: transcribe_audio@1, unconstrained. */
export function transcribeAvailabilityInput(
  implementationId: RegisterAvailabilityCapabilityInput["implementationId"],
): RegisterAvailabilityCapabilityInput {
  return {
    scope: SCOPE_ALPHA,
    implementationId,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: CAP_VERSION_1,
    constraints: [],
  };
}

/** Explicit availability: generate_voice@1 with a declared rate-limit constraint. */
export function generateVoiceAvailabilityInput(
  implementationId: RegisterAvailabilityCapabilityInput["implementationId"],
): RegisterAvailabilityCapabilityInput {
  return {
    scope: SCOPE_ALPHA,
    implementationId,
    capabilityId: CAP_GENERATE_VOICE,
    capabilityVersion: CAP_VERSION_1,
    constraints: [
      { kind: "rate-limit", parameters: { requestsPerWindow: 60, windowMs: 60_000 } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rights-grant fixture builder (the explicit-grant DATA the gate evaluates)
// ---------------------------------------------------------------------------

/**
 * Builds one explicit RightsGrant record naming ONE subject/action pair —
 * the DATA the REAL evaluateRights rule consumes (nothing is inferred).
 *
 * Brand bridge (the testing-seam twin of the call surface's documented one):
 * the canonical contracts `IdentityRef` and the rights authority's
 * `IdentityId` brand the same runtime string principal, so the fixture
 * accepts the actor as an `IdentityRef` and crosses the brand exactly once,
 * here — never a value boundary.
 */
export function rightsGrantFixture(input: {
  readonly grantId: string;
  readonly tenantId: TenantId;
  readonly grantee: IdentityRef;
  readonly action: RightsGrant["scope"]["actions"][number];
  readonly subjectRef: string;
  readonly expiresAt?: string | null;
}): RightsGrant {
  return Object.freeze({
    id: input.grantId as RightsGrant["id"],
    tenantId: input.tenantId,
    version: 1,
    scope: Object.freeze({
      actions: Object.freeze([input.action]),
      subjectRefs: Object.freeze([input.subjectRef]),
    }),
    grantee: input.grantee as unknown as RightsGrant["grantee"],
    sourceRefs: Object.freeze(["fixture:explicit-grant"]),
    terms: Object.freeze({
      attributionRequired: true,
      commercialUseAllowed: false,
      derivationAllowed: false,
      notes: "fixture grant",
    }),
    grantedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
  });
}

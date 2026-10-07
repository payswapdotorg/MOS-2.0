/**
 * SOCIAL-001 test fixtures — PROVIDER DATA ONLY.
 *
 * ⚠ SEED/EXAMPLE DATA — NOT PROVIDER CLAIMS ⚠
 *
 * Every provider identity in these fixtures is FICTIONAL (aurora-social /
 * cinder-social / dune-social): no real provider, platform or vendor is
 * named anywhere in this package — not in code, not even in test data
 * (the fictional names appear ONLY in these disclosed data/composition
 * seams — test-pinned). The fixtures exercise the social channel
 * registry + adapter surface with tenant-scoped DATA records: an
 * integrations four-layer binding (definition → implementation →
 * instance), channels with MIXED capability matrices, artifact refs
 * (references only), presentations, rights grants and policy rules.
 */

import type {
  AccountRef,
  ArtifactId,
  ArtifactType,
  ContentDigest,
  EvidenceRef,
  IdentityRef,
  PolicyRef,
  ProviderId,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { ArtifactRef } from "@mos/content";
import type { MerchantClientInstanceId } from "@mos/integrations";
import type { RightsAction, RightsGrant } from "@mos/rights";

import type { RegisterSocialChannelInput } from "../contracts/social-channel.js";
import type { SocialProviderCapability } from "../contracts/social-operation.js";
import type { InMemoryPolicyRule } from "../adapters/in-memory-social-policy-gate.js";
import type { InMemorySocialTransportRoute } from "../adapters/in-memory-social-transport.js";

// ---------------------------------------------------------------------------
// Tenants / identities (data)
// ---------------------------------------------------------------------------

export const TENANT_ALPHA = "tenant-alpha" as TenantId;
export const TENANT_BETA = "tenant-beta" as TenantId;

export const SCOPE_ALPHA = { tenantId: TENANT_ALPHA } as TenantScope;
export const SCOPE_BETA = { tenantId: TENANT_BETA } as TenantScope;

export const MERCHANT_ONE = "identity:merchant-one" as IdentityRef;
export const ACTOR_ONE = "identity:actor-one" as IdentityRef;
export const ACTOR_TWO = "identity:actor-two" as IdentityRef;

// ---------------------------------------------------------------------------
// Fictional providers + transport routes (DATA — the platform-said payloads)
// ---------------------------------------------------------------------------

/** Aurora Social: a fictional social platform with a MIXED capability surface. */
export const AURORA_PROVIDER_ID = "provider:aurora-social" as ProviderId;
/** Cinder Social: a fictional social platform whose transport route FAILS. */
export const CINDER_PROVIDER_ID = "provider:cinder-social" as ProviderId;
/** Dune Social: a fictional social platform with NO transport route (echo only). */
export const DUNE_PROVIDER_ID = "provider:dune-social" as ProviderId;

/**
 * The fictional Aurora platform-said payload (DATA): the union the
 * fictional platform's answer carries — each operation's typer picks the
 * fields it needs (postRef/publishedAt for publish, scheduleRef/
 * scheduledAt for schedule, observations for read-observations,
 * retractedAt for delete, restrictions for list-restrictions). The
 * numbers are FICTIONAL fixture values the transport double returns with
 * its honest self-label — never live platform evidence.
 */
export const AURORA_TRANSPORT_OUTPUT = {
  postRef: "aurora-post:fixture-1",
  publishedAt: "2026-06-01T00:00:05.000Z",
  scheduleRef: "aurora-schedule:fixture-1",
  scheduledAt: "2026-06-02T12:00:00.000Z",
  retractedAt: "2026-06-03T00:00:05.000Z",
  observations: [
    {
      subjectRef: "aurora-post:fixture-1",
      reported: { impressions: 1523, likes: 37, shares: 4 },
      observedAt: "2026-06-04T00:00:00.000Z",
      providerRefs: ["aurora-insight:fixture-1"],
    },
  ],
  restrictions: [
    {
      observedAt: "2026-06-01T00:00:00.000Z",
      description: "fictional rate window: 25 posts per 24h",
    },
  ],
} as const;

/** Standard scripted transport routes (DATA keyed by fictional provider ids). */
export const STANDARD_TRANSPORT_ROUTES: Readonly<Record<string, InMemorySocialTransportRoute>> = {
  [AURORA_PROVIDER_ID as string]: { kind: "ok", output: AURORA_TRANSPORT_OUTPUT },
  [CINDER_PROVIDER_ID as string]: {
    kind: "fail",
    message: "fictional cinder-social outage",
    retriable: true,
  },
  // dune-social deliberately UNROUTED: the double echoes (no platform
  // data) — the honest invalid-platform-response path.
};

// ---------------------------------------------------------------------------
// Capability matrices (DATA — mixed declarations for the fixture channels)
// ---------------------------------------------------------------------------

/** The FULL supported matrix (the standard aurora-main channel). */
export const FULLY_SUPPORTED_MATRIX: readonly SocialProviderCapability[] = [
  { operation: "publish", support: "supported" },
  { operation: "schedule", support: "supported" },
  { operation: "read-observations", support: "supported" },
  { operation: "delete", support: "supported" },
  { operation: "list-restrictions", support: "supported" },
];

/** A matrix declaring schedule UNKNOWN (the preserved-first-class path). */
export const SCHEDULE_UNKNOWN_MATRIX: readonly SocialProviderCapability[] = [
  { operation: "publish", support: "supported" },
  { operation: "schedule", support: "unknown" },
  { operation: "read-observations", support: "supported" },
  { operation: "delete", support: "supported" },
  { operation: "list-restrictions", support: "supported" },
];

/** A matrix declaring delete UNSUPPORTED (the typed-refusal path). */
export const DELETE_UNSUPPORTED_MATRIX: readonly SocialProviderCapability[] = [
  { operation: "publish", support: "supported" },
  { operation: "schedule", support: "supported" },
  { operation: "read-observations", support: "supported" },
  { operation: "delete", support: "unsupported" },
  { operation: "list-restrictions", support: "supported" },
];

/** A PARTIAL matrix (only publish declared — everything else undeclared). */
export const PUBLISH_ONLY_MATRIX: readonly SocialProviderCapability[] = [
  { operation: "publish", support: "supported" },
];

// ---------------------------------------------------------------------------
// The integrations four-layer fixture inputs (fictional DATA — the binding)
// ---------------------------------------------------------------------------

/** Layer-1 definition input for the fictional Aurora Social platform. */
export const AURORA_DEFINITION_INPUT = {
  scope: SCOPE_ALPHA,
  providerId: AURORA_PROVIDER_ID,
  displayName: "Aurora Social (fictional fixture)",
  kind: "social-platform",
  transport: {
    transportKind: "http-rest",
    authentication: { kind: "oauth2", managedBy: "integrations" },
    invocationContract: { type: "object", required: ["operation", "parameters"] },
  },
  declaredCapabilities: [],
} as const;

/** Evidence refs used by the fixture implementation's positive status. */
export const EVIDENCE_HEALTH_CHECK = "evidence:health-check" as EvidenceRef;

/** The external account boundary of the fixture instance (data). */
export const AURORA_EXTERNAL_ACCOUNT = "account:aurora-merchant-one" as AccountRef;

// ---------------------------------------------------------------------------
// Content artifact fixture (REFERENCES ONLY — never media bytes)
// ---------------------------------------------------------------------------

/**
 * The fixture artifact REF: the canonical ArtifactRef shape — references
 * only (artifact id, version, digest, storage ref, rights ref,
 * provenance ref). There is no media-value field anywhere (the
 * artifact-ref-inputs test pins this structurally).
 */
export const FIXTURE_ARTIFACT: ArtifactRef = Object.freeze({
  artifactId: "artifact-fixture-1" as ArtifactId,
  version: 3 as Version,
  tenantId: TENANT_ALPHA,
  digest: "sha256:fixture-digest-0001" as ContentDigest,
  type: "video/mp4" as ArtifactType,
  storageRef: "storage:fixture-video-1" as StorageRef,
  rightsRef: "rights:fixture-grant-1" as RightsRef,
  provenanceRef: "provenance:fixture-record-1" as ProvenanceRef,
});

/** A second artifact ref (a different subject for rights tests). */
export const SECOND_ARTIFACT: ArtifactRef = Object.freeze({
  ...FIXTURE_ARTIFACT,
  artifactId: "artifact-fixture-2" as ArtifactId,
  storageRef: "storage:fixture-video-2" as StorageRef,
});

// ---------------------------------------------------------------------------
// Presentation + channel input builders (DATA)
// ---------------------------------------------------------------------------

/** The fixture declared presentation (small control-plane data). */
export const FIXTURE_PRESENTATION = Object.freeze({
  kind: "artifact-with-caption",
  caption: "fixture caption (fictional)",
});

/** Builds a channel registration input over the fixture binding (DATA). */
export function channelInput(
  instanceRef: MerchantClientInstanceId,
  matrix: readonly SocialProviderCapability[],
  overrides: {
    readonly name?: string;
    readonly providerId?: ProviderId;
    readonly externalAccount?: AccountRef;
    readonly scope?: TenantScope;
  } = {},
): RegisterSocialChannelInput {
  return {
    scope: overrides.scope ?? SCOPE_ALPHA,
    name: overrides.name ?? "aurora-main",
    providerId: overrides.providerId ?? AURORA_PROVIDER_ID,
    displayName: "Aurora Social (fictional fixture)",
    instanceRef,
    ...(overrides.externalAccount !== undefined
      ? { externalAccount: overrides.externalAccount }
      : {}),
    capabilityMatrix: matrix,
  };
}

// ---------------------------------------------------------------------------
// Rights-grant + policy-rule fixture builders (the explicit DATA the gates evaluate)
// ---------------------------------------------------------------------------

/**
 * Builds one explicit RightsGrant record naming actions × subjects — the
 * DATA the REAL evaluateRights rule consumes (nothing is inferred).
 *
 * Brand bridge (the testing-seam twin of the rights gate's documented
 * one): the canonical contracts `IdentityRef` and the rights authority's
 * `IdentityId` brand the same runtime string principal; the fixture
 * accepts the actor as an `IdentityRef` and crosses the brand exactly
 * once, here — never a value boundary.
 */
export function socialRightsGrantFixture(input: {
  readonly grantId: string;
  readonly tenantId: TenantId;
  readonly grantee: IdentityRef;
  readonly actions: readonly RightsAction[];
  readonly subjectRefs: readonly string[];
  readonly expiresAt?: string | null;
  readonly revokedAt?: string | null;
}): RightsGrant {
  return Object.freeze({
    id: input.grantId as RightsGrant["id"],
    tenantId: input.tenantId,
    version: 1,
    scope: Object.freeze({
      actions: Object.freeze([...input.actions]),
      subjectRefs: Object.freeze([...input.subjectRefs]),
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
    revokedAt: input.revokedAt ?? null,
  });
}

/** The standard fixture policy ref (the double's rules cite it — DATA). */
export const FIXTURE_POLICY_REF = "policy:fixture-alpha-distribution" as PolicyRef;

/** Builds a permitting policy rule for one tenant (DATA — the disclosed double's stand-in verdict). */
export function permitRule(
  scope: TenantScope,
  policyRef: PolicyRef = FIXTURE_POLICY_REF,
): InMemoryPolicyRule {
  return { policyRef, scope, decision: "permitted" };
}

/** Builds a denying policy rule for one tenant (DATA). */
export function denyRule(
  scope: TenantScope,
  denialReason: string,
  policyRef: PolicyRef = "policy:fixture-denial" as PolicyRef,
): InMemoryPolicyRule {
  return { policyRef, scope, decision: "denied", denialReason };
}

/** A fixture clock value (deterministic tests). */
export const FIXTURE_NOW = "2026-06-01T00:00:00.000Z" as Timestamp;

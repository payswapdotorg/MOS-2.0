/**
 * ProviderDefinition — layer 1 of the connector provider contract
 * (INTEG-001): WHAT a provider IS.
 *
 * A versioned, tenant-scoped registry record declaring the provider's
 * identity (data), its generic kind, its transport contract surface and its
 * declared capability surface. A definition NEVER carries credentials — the
 * credential binding happens per-merchant at layer 3
 * (MerchantClientInstance) and even there only as a `CredentialRef` handle.
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   ConnectorProvider.required = [providerId, version, capabilities,
 *     authentication, invocationContract, evidenceModel, errorModel,
 *     rateLimitObservation]
 *
 * The canonical `ConnectorProvider` contract is distributed across the
 * four-layer structure (this file documents the split so reconciliation is
 * mechanical):
 * - LAYER 1 (definition — declared): `providerId`, `version`,
 *   `capabilities` (the richer declared capability surface below),
 *   `authentication` (AuthenticationModel — WHICH auth kind and WHO escrows
 *   credentials, never credential values), `invocationContract` (transport
 *   surface).
 * - LAYER 2 (implementation — observed): `evidenceModel`, `errorModel`,
 *   `rateLimitObservation` (see provider-implementation.ts).
 *
 * AUTHORITY DISCIPLINE (test-pinned): this record — like every exported
 * contract in this package — is PROVIDER-NEUTRAL. No provider name and no
 * provider-specific type appears anywhere in the code; the `providerId`,
 * `displayName` and capability declarations are DATA registered by tenants
 * and operators. Provider specifics live in data, never in authority code.
 */

import type {
  AccountRef,
  AuthenticationModel,
  CapabilityId,
  JsonSchemaObject,
  ProviderId,
  TenantScope,
  Version,
} from "@mos/contracts";

import type { ProviderDefinitionId } from "./ids.js";

// ---------------------------------------------------------------------------
// Generic (provider-neutral) closed vocabularies
// ---------------------------------------------------------------------------

/**
 * Generic integration kinds a provider definition can declare. Deliberately
 * coarse and provider-neutral: "which category of external thing is this",
 * never "which vendor". Anything more specific is provider data.
 */
export const PROVIDER_KINDS = Object.freeze([
  "social-platform",
  "commerce-platform",
  "media-platform",
  "payment-processor",
  "analytics-service",
  "communication-service",
  "storage-service",
  "other",
] as const);

/** One of the generic {@link PROVIDER_KINDS} entries. */
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Generic transport kinds a provider's contract surface can declare.
 * Provider-neutral: the transport seam (`ProviderTransportPort`) routes by
 * the declared kind, never by vendor.
 */
export const TRANSPORT_KINDS = Object.freeze([
  "http-rest",
  "http-rpc",
  "graphql",
  "websocket",
  "webhook",
  "email",
  "file-transfer",
  "other",
] as const);

/** One of the generic {@link TRANSPORT_KINDS} entries. */
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

// ---------------------------------------------------------------------------
// Declared capability surface (parity is never assumed)
// ---------------------------------------------------------------------------

/**
 * The support level a provider DECLARES for one capability. The backlog
 * acceptance for INTEG-001: "capability parity is never assumed; every
 * provider declares supported/unsupported/unknown capabilities". A
 * declaration is provider-authored DATA — it creates no availability on its
 * own; only explicit layer-4 AvailabilityCapability records make a
 * capability available on an implementation (pinned by tests).
 */
export const CAPABILITY_SUPPORT_LEVELS = Object.freeze([
  "supported",
  "unsupported",
  "unknown",
] as const);

/** One of the {@link CAPABILITY_SUPPORT_LEVELS} entries. */
export type CapabilitySupportLevel = (typeof CAPABILITY_SUPPORT_LEVELS)[number];

/** One declared capability-surface entry: capability + declared support. */
export interface DeclaredCapabilitySurfaceEntry {
  /** Which capability (id resolves through the @mos/capabilities vocabulary). */
  readonly capabilityId: CapabilityId;
  /** The provider's own declaration of its support for this capability. */
  readonly support: CapabilitySupportLevel;
  /** Optional free-form declaration note (data, provider-authored). */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Transport contract surface
// ---------------------------------------------------------------------------

/**
 * The transport contract surface a provider declares: the generic transport
 * kind, the canonical authentication model (which auth kind, who escrows
 * credentials — a DECLARATION, never credential values) and the canonical
 * invocation contract schema (the frozen `ConnectorProvider` field).
 */
export interface TransportContractSurface {
  /** Generic transport kind (provider-neutral closed vocabulary). */
  readonly transportKind: TransportKind;
  /**
   * Canonical `ConnectorProvider.authentication`: the auth kind string is
   * provider DATA (e.g. an OAuth2 or API-key flow name); `managedBy`
   * declares who escrows credentials. Credential VALUES never appear here —
   * structurally there is no field for them.
   */
  readonly authentication: AuthenticationModel;
  /**
   * Canonical `ConnectorProvider.invocationContract`: JSON-schema object
   * describing the provider's invocation surface (data).
   */
  readonly invocationContract: JsonSchemaObject;
}

// ---------------------------------------------------------------------------
// ProviderDefinition (layer 1)
// ---------------------------------------------------------------------------

/**
 * Layer 1 — WHAT a provider IS.
 *
 * Versioned append-only and tenant-scoped like every registry record:
 * registering a new version of an existing definition id appends to the
 * version history (monotonic, immutable prior versions). The definition
 * carries NO credential surface of any kind — not a value, not a handle;
 * credential handles first appear at layer 3 per merchant.
 */
export interface ProviderDefinition {
  /** Registry record identity (stable across versions). */
  readonly id: ProviderDefinitionId;
  /** Monotonic record version (append-only corrections). */
  readonly version: Version;
  /** Tenant/workspace scope (§31 — all mutable records are scoped). */
  readonly scope: TenantScope;
  /**
   * The external provider's identity — canonical `ProviderId`. DATA: the
   * string names whatever external service the tenant integrates; the code
   * never branches on it.
   */
  readonly providerId: ProviderId;
  /** Human-facing name for the provider (tenant-authored data). */
  readonly displayName: string;
  /** Generic provider kind (provider-neutral closed vocabulary). */
  readonly kind: ProviderKind;
  /** The declared transport contract surface. */
  readonly transport: TransportContractSurface;
  /**
   * The declared capability surface: every capability entry carries an
   * explicit supported/unsupported/unknown declaration. Duplicate
   * capability entries are rejected at registration (fail-closed).
   */
  readonly declaredCapabilities: readonly DeclaredCapabilitySurfaceEntry[];
  /**
   * The external account boundary this provider connects to, when the
   * definition itself names one (canonical `AccountRef`; optional because
   * some definitions are account-agnostic — instances carry the concrete
   * binding).
   */
  readonly externalAccount?: AccountRef;
}

/**
 * Input for registering a definition snapshot (layer 1). Record versions
 * are registry-assigned (append-only): registering with an id that already
 * exists IN THE SAME TENANT appends the next version; a fresh id starts at
 * version 1. A cross-tenant id collision is an independent record.
 */
export interface RegisterProviderDefinitionInput {
  /** Optional record id (minted when omitted). */
  readonly id?: ProviderDefinitionId;
  readonly scope: TenantScope;
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly kind: ProviderKind;
  readonly transport: TransportContractSurface;
  readonly declaredCapabilities: readonly DeclaredCapabilitySurfaceEntry[];
  readonly externalAccount?: AccountRef;
}

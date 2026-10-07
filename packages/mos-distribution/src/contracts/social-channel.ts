/**
 * SocialChannel — the distribution authority's channel record (SOCIAL-001).
 *
 * A versioned, tenant-scoped, append-only registry record declaring one
 * tenant distribution channel on a social platform: the platform identity
 * (DATA), the INTEGRATIONS binding the channel acts through (a layer-3
 * MerchantClientInstance of @mos/integrations — the link that carries the
 * credential HANDLE at the transport boundary, never a credential value),
 * the optional external account boundary, and the DECLARED capability
 * matrix (one {@link SocialProviderCapability} per operation — parity is
 * never assumed; see social-operation.ts).
 *
 * CANONICAL CONTRACT MAPPING (spec/contracts/core-contracts-v2.0.yaml
 * `SocialAdapter`): the channel record IS the typed projection of the
 * canonical `SocialAdapter` declaration — `provider` → providerId,
 * `version` → the registry-assigned record version, `capabilityMatrix` →
 * the TYPED operation matrix (richer than the canonical boolean record:
 * see social-operation.ts for the documented projection), and the
 * canonical operation lists map onto the closed operation vocabulary. An
 * adapter with publishing operations is NOT a publication authority by
 * itself (canonical docblock): publishing flows through
 * distribution + rights + policy — Studio never publishes directly
 * (AGENTS.md).
 *
 * AUTHORITY DISCIPLINE (test-pinned): this record — like every exported
 * contract in this package — is PROVIDER-NEUTRAL. No provider name and no
 * provider-specific type appears anywhere in the code; providerId,
 * displayName and the matrix declarations are DATA registered by tenants.
 * Social platforms are NEVER MOS authorities (§3): MOS records what
 * platforms report, never invents it.
 */

import type {
  AccountRef,
  ProviderId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { MerchantClientInstanceId } from "@mos/integrations";

import type { SocialChannelId } from "./ids.js";
import type { SocialProviderCapability } from "./social-operation.js";

/**
 * The social channel: WHAT the tenant's presence on a social platform is —
 * the platform identity, the integrations binding, the account boundary
 * and the DECLARED operation capability matrix that governs which social
 * operations may be invoked through it.
 *
 * Versioned append-only and tenant-scoped like every registry record:
 * registering a new version of an existing channel id appends to the
 * version history (monotonic, immutable prior versions — a corrected
 * capability matrix is a NEW version, never a mutation). The channel
 * carries NO credential surface of any kind: credentials stay at the
 * integration boundary (§31), carried as the MerchantClientInstance's
 * CredentialRef handle behind {@link SocialChannel.instanceRef}.
 */
export interface SocialChannel {
  /** Registry record identity (stable across versions). */
  readonly id: SocialChannelId;
  /** Monotonic record version (append-only corrections). */
  readonly version: Version;
  /** Tenant/workspace scope (§31 — all mutable records are scoped). */
  readonly scope: TenantScope;
  /** Tenant-facing channel name (unique within the tenant). */
  readonly name: string;
  /**
   * The social platform's identity — canonical `ProviderId`. DATA: the
   * string names whatever external platform the tenant distributes
   * through; the code never branches on it (§3 — platforms are never
   * authorities; MOS keeps records, not platform state).
   */
  readonly providerId: ProviderId;
  /** Human-facing name for the platform surface (tenant-authored data). */
  readonly displayName: string;
  /**
   * The INTEGRATIONS binding this channel acts through: a layer-3
   * MerchantClientInstanceId of @mos/integrations (INTEG-001). The
   * instance carries the credential HANDLE and the external account
   * boundary; the link is validated fail-closed at registration (the
   * instance must exist IN THE SAME TENANT). Social adapter calls reach
   * the provider through the declared transport seam carrying this
   * reference — credential values never enter the distribution control
   * plane.
   */
  readonly instanceRef: MerchantClientInstanceId;
  /**
   * The channel's account boundary AT the platform, when one is named
   * (canonical `AccountRef`, typically echoed from the integrations
   * instance; optional — some channels are account-agnostic).
   */
  readonly externalAccount?: AccountRef;
  /**
   * The DECLARED capability matrix: every entry declares one operation's
   * support explicitly (supported/unsupported/unknown). Duplicate
   * operation entries are rejected at registration (fail-closed). An
   * operation with NO entry is UNDECLARED — invocating it is a typed
   * refusal: the matrix is the whole surface, parity is never assumed.
   */
  readonly capabilityMatrix: readonly SocialProviderCapability[];
  /** When this record version was created. */
  readonly createdAt: Timestamp;
}

/**
 * Input for registering a channel snapshot. Record versions are
 * registry-assigned (append-only): registering with an id that already
 * exists IN THE SAME TENANT appends the next version; a fresh id starts at
 * version 1. A cross-tenant id collision is an independent record.
 */
export interface RegisterSocialChannelInput {
  /** Optional record id (minted when omitted). */
  readonly id?: SocialChannelId;
  readonly scope: TenantScope;
  readonly name: string;
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly instanceRef: MerchantClientInstanceId;
  readonly externalAccount?: AccountRef;
  readonly capabilityMatrix: readonly SocialProviderCapability[];
}

/**
 * The canonical boolean projection of one channel's capability matrix
 * (`SocialAdapter.capabilityMatrix: Record<string, boolean>`): supported →
 * true, unsupported → false. The `unknown` declaration is DELIBERATELY
 * ABSENT from the projection — it has no honest boolean (projecting it to
 * false would coerce a preserved-first-class state); consumers of the
 * canonical record must consult the TYPED matrix for unknown support.
 */
export function projectCapabilityMatrix(
  matrix: readonly SocialProviderCapability[],
): Readonly<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const entry of matrix) {
    if (entry.support === "supported") {
      out[entry.operation] = true;
    } else if (entry.support === "unsupported") {
      out[entry.operation] = false;
    }
  }
  return Object.freeze(out);
}

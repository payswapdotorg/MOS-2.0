import type { ProviderId, Timestamp } from '@mos/contracts';
import type { HumanProductionTaskId } from '@mos/contracts';
import type { TenantScope } from '@mos/contracts';

/**
 * The Arena provider seam (LAB-014, §17 / INTEG-001 vocabulary).
 *
 * Basis: spec/mos-architecture-v2.0.md §17 ("Arena is a provider through
 * Integration, never a second MOS marketplace"), architecture lock rule 27,
 * spec/contracts/core-contracts-v2.0.yaml ConnectorProvider.required (the
 * provider-contract vocabulary: providerId + version + capability surface —
 * INTEG-001 owns the records), spec/mos-module-registry-v2.0.yaml (the lab
 * module's dependencies do NOT include integrations — the lab never imports
 * @mos/integrations).
 *
 * The lab holds ONLY {@link ArenaProviderRef} references into the
 * integrations authority's provider records and reaches the provider
 * through this NARROW PORT SEAM. The real adapter over @mos/integrations is
 * composition-root wiring; the in-memory adapter shipped with the lab is a
 * DISCLOSED DOUBLE (deterministic, zero-I/O, self-labeled interactions —
 * double output can never masquerade as live provider evidence).
 */

/**
 * A reference to the Arena provider record in the integrations authority:
 * the INTEG-001 ConnectorProvider record cited at an exact version. The lab
 * never holds provider credentials, capability surfaces or any other
 * provider-record content — only this reference.
 */
export interface ArenaProviderRef {
  readonly providerId: ProviderId;
  /** The cited ConnectorProvider record version (exact). */
  readonly providerVersion: number;
}

/** Offering one human production task to the Arena provider. */
export interface ArenaTaskOfferInput {
  readonly scope: TenantScope;
  readonly taskId: HumanProductionTaskId;
  readonly provider: ArenaProviderRef;
}

/**
 * The recorded provider interaction for one Arena offer: WHICH provider,
 * whether it accepted, and an OPAQUE interaction reference (never inline
 * provider data — reference-first discipline).
 */
export interface ArenaTaskOfferRecord {
  readonly provider: ArenaProviderRef;
  readonly taskId: HumanProductionTaskId;
  readonly accepted: boolean;
  /** Opaque reference to the provider-side interaction record. */
  readonly interactionRef: string;
  readonly offeredAt: Timestamp;
}

/** Machine-readable failure codes for the Arena provider seam. */
export type ArenaProviderSeamErrorCode =
  | 'provider-unavailable'
  | 'provider-declined';

/** Typed failure value (result union, the MOS domain convention). */
export interface ArenaProviderSeamError {
  readonly error: ArenaProviderSeamErrorCode;
  readonly message: string;
}

/**
 * The Arena provider port seam. ONE method: offering a human production
 * task to the Arena provider through Integration. Implementations wrap the
 * integrations authority (INTEG-001) — providers are resolved, rights/policy
 * gates precede provider calls there; the lab never sees any of that and
 * never imports the integrations module.
 */
export interface ArenaProviderPort {
  /**
   * Offer one human production task to the Arena provider. Returns the
   * recorded interaction (accepted or declined, with the opaque interaction
   * reference) or a typed seam failure (`provider-unavailable`).
   */
  offerHumanProductionTask(
    input: ArenaTaskOfferInput,
  ): Promise<ArenaTaskOfferRecord | ArenaProviderSeamError>;
}

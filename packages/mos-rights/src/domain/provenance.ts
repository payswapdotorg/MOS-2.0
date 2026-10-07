import type { IdentityId } from '@mos/identity';
import type { TenantId } from '@mos/contracts';
import type { ProvenanceRecordId } from './ids.js';

/**
 * How a piece of content came to exist (architecture §6 conceptual chain:
 * reference → acquired input → raw capture → transform → intermediate →
 * composition → final candidate).
 *
 * The vocabulary is shared with `@mos/content`'s `CreationMethod` (CORE-004):
 * both are defined locally now and unify at the CORE-001 contracts
 * reconciliation (Wave 2).
 */
export type ProvenanceCreationMethod =
  | 'reference'
  | 'acquisition'
  | 'raw-capture'
  | 'transform'
  | 'composition'
  | 'engine-output'
  | 'human-contribution';

/**
 * Who or what performed the step. A discriminated union so an engine step can
 * never be silently attributed to a human and vice versa (architecture §27
 * "deceptive attribution" is a disallowed strategy).
 */
export type ProvenanceActor =
  | { readonly kind: 'identity'; readonly identityId: IdentityId }
  | { readonly kind: 'engine'; readonly engineRef: string }
  | { readonly kind: 'system' };

/**
 * A provenance record: immutable evidence of how content was created.
 *
 * Immutability is by construction — the repository port exposes NO update or
 * delete operation for provenance records, so `version` is always 1 and a
 * record, once written, can never change. Correcting a provenance statement
 * means writing a NEW record and referencing it from new artifact versions.
 *
 * Referenced by `Artifact.provenanceRef` (CORE-004) in its stable
 * {@link ProvenanceRef} form.
 */
export interface ProvenanceRecord {
  readonly id: ProvenanceRecordId;
  readonly tenantId: TenantId;
  /** Always 1: provenance records are immutable (no update path exists). */
  readonly version: number;
  /** How the content came to exist. */
  readonly creationMethod: ProvenanceCreationMethod;
  /** Who or what performed the step. */
  readonly actor: ProvenanceActor;
  /**
   * References to the parent sources/artifacts this step consumed. Empty for
   * root records (a first acquisition or raw capture with no parents).
   */
  readonly lineageRefs: readonly string[];
  /** ISO-8601 timestamp of the step. */
  readonly recordedAt: string;
}

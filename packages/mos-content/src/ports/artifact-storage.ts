import type { TenantScope } from '@mos/identity';
import type { ContentDigest, StorageRef } from '../contracts/artifact.js';

/**
 * ArtifactStorage port — MOS-owned object-storage surface declared INSIDE the
 * content module (CORE-004: "object-store references instead of control-plane
 * media transport").
 *
 * Why this port lives here and not in `@mos/substrate-adapters`: the module
 * registry declares content's dependencies as `[contracts, identity, rights]`
 * — the substrate adapters package is NOT among them. Object storage stays
 * behind a MOS-domain port; a substrate-backed adapter can satisfy it
 * structurally at the composition root (the formats align: refs are strings,
 * digests are `sha256:<hex>`).
 *
 * Contract:
 * - `put` stores bytes under the given tenant scope and returns the
 *   content-addressed `storageRef` + `digest`. Identical bytes in the same
 *   scope are idempotent (same ref). Byte buffers are copied: mutating the
 *   input after `put` never affects stored content.
 * - `get` returns a private copy of the stored bytes, or a typed error when
 *   the ref does not resolve (`object-not-found`) or resolves in a different
 *   tenant scope (`cross-tenant-reference`).
 * - Large media NEVER crosses the control plane through this port's callers:
 *   artifacts record only the returned `storageRef` string.
 */
export interface ArtifactStorage {
  put(request: PutArtifactContentRequest): Promise<StoredArtifactContent | ArtifactStorageError>;
  get(scope: TenantScope, storageRef: StorageRef): Promise<Uint8Array | ArtifactStorageError>;
}

/** Request to store artifact bytes inside a tenant scope. */
export interface PutArtifactContentRequest {
  readonly scope: TenantScope;
  /** Raw bytes. Copied on store — later input mutation is invisible. */
  readonly bytes: Uint8Array;
  /** Optional logical content type (e.g. `audio/wav`). */
  readonly contentType?: string;
}

/** Result of a successful put (or an idempotent re-put of identical bytes). */
export interface StoredArtifactContent {
  /** Content-addressed, scope-qualified storage reference. */
  readonly storageRef: StorageRef;
  /** `sha256:<lowercase-hex>` digest of the stored bytes. */
  readonly digest: ContentDigest;
  /** Byte length of the stored content. */
  readonly size: number;
  /** ISO-8601 timestamp of the first store of this content in this scope. */
  readonly storedAt: string;
}

/** Machine-readable failure codes. */
export type ArtifactStorageErrorCode =
  | 'invalid-input'
  | 'object-not-found'
  | 'cross-tenant-reference'
  | 'digest-mismatch';

/** Typed failure value (result union, no thrown subclasses). */
export interface ArtifactStorageError {
  readonly error: ArtifactStorageErrorCode;
  readonly message: string;
}

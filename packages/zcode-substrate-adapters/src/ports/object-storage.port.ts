/**
 * ObjectStoragePort — put/get/delete object by storage ref, content-addressed.
 *
 * MOS v2.0 (W0-B / BOOT-003). MOS-owned contract surface.
 * PORT INVARIANT: files under `src/ports/**` NEVER import `@zcode/*`.
 *
 * Architecture role (see `spec/mos-architecture-v2.0.md` §"Media"):
 * large media never crosses the control-plane RPC. Artifacts are stored
 * out-of-band and referenced by {@link StorageRef}. This port is the
 * substrate-facing object storage surface MOS domain code consumes; the
 * Artifact authority (CORE-004) records refs, digests and rights metadata
 * separately.
 *
 * Content addressing:
 * - The digest is `sha256:<hex>` of the object bytes (algorithm-prefixed,
 *   lowercase hex). Digests are stable across instances, processes and
 *   restarts for identical bytes.
 * - Objects are keyed by `(scope, digest)`. Identical bytes put twice into
 *   the same scope yield the identical ref (idempotent put; first-write
 *   metadata wins). Identical bytes in different scopes are distinct refs.
 *
 * Scoping:
 * - A scope namespaces objects (tenant / workspace / subsystem). Refs are
 *   scoped: a ref only resolves inside its own scope. Scopes must match
 *   {@link STORAGE_SCOPE_PATTERN} — lowercase segments
 *   `[a-z0-9][a-z0-9._-]{0,63}` joined by `/`.
 */

/** Storage scope: namespaces objects. Lowercase segments joined by `/`. */
export type StorageScope = string;

/** Content digest: `sha256:<lowercase-hex>`. */
export type ContentDigest = string;

/** Canonical scope pattern enforced by adapters (path-safe, no traversal). */
export const STORAGE_SCOPE_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,63}(?:\/[a-z0-9][a-z0-9._-]{0,63})*$/;

/** Content-addressed, scoped reference to a stored object. */
export interface StorageRef {
  readonly scope: StorageScope;
  readonly digest: ContentDigest;
}

/** Request to store object bytes inside a scope. */
export interface PutObjectRequest {
  readonly scope: StorageScope;
  /** Raw bytes; strings are encoded as UTF-8. Buffers are copied on store. */
  readonly bytes: Uint8Array | string;
  /** Optional logical content type (e.g. `audio/wav`). */
  readonly contentType?: string;
  /** Optional string-to-string metadata recorded with the object. */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Result of a successful put (or an idempotent re-put of identical bytes). */
export interface StoredObject {
  readonly ref: StorageRef;
  /** Byte length of the stored content. */
  readonly size: number;
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  /** RFC 3339 timestamp of the first store of this content in this scope. */
  readonly storedAt: string;
}

/** Raised when a ref does not resolve in its scope. */
export class ObjectNotFoundError extends Error {
  readonly code = "MOS_OBJECT_NOT_FOUND";
  readonly ref: StorageRef;

  constructor(ref: StorageRef) {
    super(`Object not found for scope "${ref.scope}" digest ${ref.digest}`);
    this.name = "ObjectNotFoundError";
    this.ref = ref;
  }
}

/** Raised when stored bytes no longer match their recorded digest. */
export class DigestMismatchError extends Error {
  readonly code = "MOS_DIGEST_MISMATCH";
  readonly ref: StorageRef;
  readonly actualDigest: ContentDigest;

  constructor(ref: StorageRef, actualDigest: ContentDigest) {
    super(
      `Digest mismatch for scope "${ref.scope}": expected ${ref.digest}, stored bytes hash to ${actualDigest}`,
    );
    this.name = "DigestMismatchError";
    this.ref = ref;
    this.actualDigest = actualDigest;
  }
}

/** Raised when a scope or ref fails scope validation (path-unsafe etc.). */
export class InvalidStorageScopeError extends Error {
  readonly code = "MOS_INVALID_STORAGE_SCOPE";
  readonly scope: StorageScope;

  constructor(scope: StorageScope, reason: string) {
    super(`Invalid storage scope "${scope}": ${reason}`);
    this.name = "InvalidStorageScopeError";
    this.scope = scope;
  }
}

/**
 * Object storage port: content-addressed put/get/delete by scoped ref.
 *
 * Contract:
 * - `put` is idempotent per `(scope, digest)`; returns the existing record
 *   for identical bytes without rewriting metadata.
 * - `get` verifies stored bytes against the ref digest and throws
 *   {@link DigestMismatchError} on corruption, {@link ObjectNotFoundError}
 *   when the ref does not resolve.
 * - `delete` returns whether an object was actually removed.
 * - Returned byte arrays are private copies; mutating them never affects
 *   stored content, and mutating the input buffer after `put` never
 *   affects stored content.
 */
export interface ObjectStoragePort {
  put(request: PutObjectRequest): Promise<StoredObject>;
  get(ref: StorageRef): Promise<Uint8Array>;
  delete(ref: StorageRef): Promise<boolean>;
}

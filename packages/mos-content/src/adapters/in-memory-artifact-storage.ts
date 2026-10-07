import type { TenantScope } from '@mos/identity';
import type { ContentDigest, StorageRef } from '../contracts/artifact.js';
import type {
  ArtifactStorage,
  ArtifactStorageError,
  ArtifactStorageErrorCode,
  PutArtifactContentRequest,
  StoredArtifactContent,
} from '../ports/artifact-storage.js';

/**
 * Options for {@link createInMemoryArtifactStorage}.
 *
 * `now` is injectable for deterministic `storedAt` timestamps; it defaults to
 * real wall-clock ISO-8601 strings.
 */
export interface InMemoryArtifactStorageOptions {
  readonly now?: () => string;
}

/**
 * Build an in-memory {@link ArtifactStorage}.
 *
 * DISCLOSED TEST DOUBLE — NOT A PRODUCTION ADAPTER: this adapter keeps bytes
 * in a process-local map so the port contract (content-addressed puts,
 * scope-qualified refs, private byte copies, cross-tenant denial) can be
 * exercised in tests. It is explicitly NOT production object storage: no
 * durability, no replication, no real object store. A substrate-backed
 * adapter (`@zcode/substrate-adapters`' ObjectStoragePort satisfies the shape
 * after a thin structural bridge) is wired at the composition root in a later
 * wave; the port is the stable contract.
 *
 * Digests are computed with the ECMAScript-global Web Crypto API
 * (`crypto.subtle`) — no Node builtin imports in runtime code.
 */
export function createInMemoryArtifactStorage(
  options: InMemoryArtifactStorageOptions = {},
): ArtifactStorage {
  const now = options.now ?? (() => new Date().toISOString());

  /** tenantId → (storageRef → stored bytes + metadata). */
  const objects = new Map<string, Map<string, StoredEntry>>();

  const fail = (error: ArtifactStorageErrorCode, message: string): ArtifactStorageError => ({
    error,
    message,
  });

  const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    // Copy into a plain ArrayBuffer so the Web Crypto API sees a BufferSource
    // regardless of the input view's backing buffer type.
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    const view = new Uint8Array(digest);
    let hex = '';
    for (const byte of view) {
      hex += byte.toString(16).padStart(2, '0');
    }
    return `sha256:${hex}`;
  };

  return {
    async put(
      request: PutArtifactContentRequest,
    ): Promise<StoredArtifactContent | ArtifactStorageError> {
      if (!(request.bytes instanceof Uint8Array) || request.bytes.length === 0) {
        return fail('invalid-input', 'artifact bytes must be a non-empty Uint8Array');
      }
      const digest = await sha256Hex(request.bytes);
      const storageRef = `mem://${request.scope.tenantId}/${digest}` as StorageRef;
      const tenantObjects = objects.get(request.scope.tenantId) ?? new Map<string, StoredEntry>();
      const existing = tenantObjects.get(storageRef);
      if (existing === undefined) {
        tenantObjects.set(storageRef, {
          // Private copy: later mutation of the input is invisible.
          bytes: request.bytes.slice(),
          contentType: request.contentType ?? null,
          storedAt: now(),
        });
      }
      objects.set(request.scope.tenantId, tenantObjects);
      const stored = tenantObjects.get(storageRef);
      if (stored === undefined) {
        return fail('invalid-input', 'failed to store artifact bytes');
      }
      const contentDigest = digest as ContentDigest;
      return {
        storageRef,
        digest: contentDigest,
        size: stored.bytes.length,
        storedAt: stored.storedAt,
      };
    },

    async get(
      scope: TenantScope,
      storageRef: StorageRef,
    ): Promise<Uint8Array | ArtifactStorageError> {
      if (storageRef.trim().length === 0) {
        return fail('invalid-input', 'storageRef must not be blank');
      }
      const tenantObjects = objects.get(scope.tenantId);
      const stored = tenantObjects?.get(storageRef);
      if (stored === undefined) {
        const existsElsewhere = [...objects.entries()].some(([, refs]) => refs.has(storageRef));
        if (existsElsewhere) {
          return fail(
            'cross-tenant-reference',
            `storageRef resolves in a different tenant scope: ${storageRef}`,
          );
        }
        return fail('object-not-found', `no object for storageRef: ${storageRef}`);
      }
      // Private copy: mutating the returned array never affects stored content.
      return stored.bytes.slice();
    },
  };
}

interface StoredEntry {
  readonly bytes: Uint8Array;
  readonly contentType: string | null;
  readonly storedAt: string;
}

/**
 * Working ObjectStoragePort adapter: in-memory and file-backed.
 *
 * MOS v2.0 (W0-B / BOOT-003). THIS ADAPTER GENUINELY WORKS — it is the
 * Wave 1+ artifact-storage building block (content-addressed digests +
 * scoped refs), usable today for MOS artifact storage references.
 *
 * This file is an ADAPTER: it may import `@zcode/*` only from the
 * allowlisted entry names in `harness/mos-boundary-rules.json`. It
 * deliberately imports no `@zcode/*` module at all — object storage is
 * implemented with node built-ins only, so the port stays substitutable
 * by any future storage backend without substrate coupling.
 *
 * Implementation notes:
 * - Digest: `sha256:<hex>` via `node:crypto` — stable across instances,
 *   processes and restarts for identical bytes.
 * - In-memory mode: a Map keyed by `<scope>/<digest>`; byte arrays are
 *   copied on put and on get (no aliasing with caller buffers).
 * - File mode layout: `<rootDir>/<scope>/<digest[0:2]>/<digest>` for the
 *   blob, `.../<digest>.meta.json` sidecar for contentType/metadata.
 *   Writes go through a temp file + rename (atomic on the same
 *   filesystem). Missing sidecars degrade to "no metadata", never to
 *   failure — the blob digest is the source of truth.
 * - Every `get` re-hashes stored bytes and throws DigestMismatchError on
 *   corruption (a real integrity check in file mode).
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ContentDigest,
  ObjectStoragePort,
  PutObjectRequest,
  StorageRef,
  StorageScope,
  StoredObject,
} from "../ports/object-storage.port.ts";
import {
  DigestMismatchError,
  InvalidStorageScopeError,
  ObjectNotFoundError,
  STORAGE_SCOPE_PATTERN,
} from "../ports/object-storage.port.ts";

interface StoredRecord {
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly storedAt: string;
}

function validateScope(scope: StorageScope): StorageScope {
  if (!STORAGE_SCOPE_PATTERN.test(scope)) {
    throw new InvalidStorageScopeError(
      scope,
      "must match lowercase segments [a-z0-9][a-z0-9._-]{0,63} joined by '/'",
    );
  }
  return scope;
}

function toBytes(input: Uint8Array | string): Uint8Array {
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  // Private copy: later mutation of the caller's buffer never changes
  // stored content.
  return new Uint8Array(input);
}

function digestOf(bytes: Uint8Array): ContentDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function memoryKey(scope: StorageScope, digest: ContentDigest): string {
  return `${scope}/${digest}`;
}

function toStoredObject(
  record: StoredRecord,
  scope: StorageScope,
  digest: ContentDigest,
): StoredObject {
  return {
    ref: { scope, digest },
    size: record.size,
    contentType: record.contentType,
    metadata: record.metadata,
    storedAt: record.storedAt,
  };
}

async function verifyOrThrow(ref: StorageRef, bytes: Uint8Array): Promise<Uint8Array> {
  const actual = digestOf(bytes);
  if (actual !== ref.digest) {
    throw new DigestMismatchError(ref, actual);
  }
  return new Uint8Array(bytes);
}

/** Content-addressed in-memory implementation (process lifetime). */
export function createInMemoryObjectStorage(): ObjectStoragePort {
  const objects = new Map<string, StoredRecord>();

  return {
    async put(request: PutObjectRequest): Promise<StoredObject> {
      const scope = validateScope(request.scope);
      const bytes = toBytes(request.bytes);
      const digest = digestOf(bytes);
      const key = memoryKey(scope, digest);
      const existing = objects.get(key);
      if (existing) {
        // Content-addressed idempotency: identical bytes already stored in
        // this scope — return the original record, first-write metadata wins.
        return toStoredObject(existing, scope, digest);
      }
      const record: StoredRecord = {
        bytes,
        size: bytes.byteLength,
        contentType: request.contentType,
        metadata: request.metadata ? { ...request.metadata } : undefined,
        storedAt: new Date().toISOString(),
      };
      objects.set(key, record);
      return toStoredObject(record, scope, digest);
    },

    async get(ref: StorageRef): Promise<Uint8Array> {
      const scope = validateScope(ref.scope);
      const record = objects.get(memoryKey(scope, ref.digest));
      if (!record) {
        throw new ObjectNotFoundError(ref);
      }
      return verifyOrThrow(ref, record.bytes);
    },

    async delete(ref: StorageRef): Promise<boolean> {
      const scope = validateScope(ref.scope);
      return objects.delete(memoryKey(scope, ref.digest));
    },
  };
}

function blobPath(rootDir: string, scope: StorageScope, digest: ContentDigest): string {
  const hex = digest.slice("sha256:".length);
  return join(rootDir, scope, hex.slice(0, 2), hex);
}

function metaPath(blob: string): string {
  return `${blob}.meta.json`;
}

interface MetaFile {
  contentType?: string;
  metadata?: Record<string, string>;
  storedAt?: string;
}

async function writeAtomic(target: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  await writeFile(temp, data);
  await rename(temp, target);
}

/**
 * Content-addressed file-backed implementation.
 *
 * @param rootDir Directory under which objects are stored (created lazily).
 *   Objects survive process restarts; two instances over the same rootDir
 *   see the same content.
 */
export function createFileObjectStorage(rootDir: string): ObjectStoragePort {
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    throw new Error("createFileObjectStorage: rootDir must be a non-empty string");
  }

  async function readMeta(blob: string): Promise<MetaFile | undefined> {
    try {
      return JSON.parse(await readFile(metaPath(blob), "utf8")) as MetaFile;
    } catch {
      // Missing/corrupt sidecar degrades to no-metadata; the blob digest is
      // the source of truth for content, never the sidecar.
      return undefined;
    }
  }

  return {
    async put(request: PutObjectRequest): Promise<StoredObject> {
      const scope = validateScope(request.scope);
      const bytes = toBytes(request.bytes);
      const digest = digestOf(bytes);
      const blob = blobPath(rootDir, scope, digest);

      let existed = true;
      try {
        await stat(blob);
      } catch {
        existed = false;
      }

      if (!existed) {
        const storedAt = new Date().toISOString();
        const meta: MetaFile = {
          contentType: request.contentType,
          metadata: request.metadata ? { ...request.metadata } : undefined,
          storedAt,
        };
        await writeAtomic(blob, bytes);
        await writeAtomic(metaPath(blob), JSON.stringify(meta, null, 2));
        return {
          ref: { scope, digest },
          size: bytes.byteLength,
          contentType: meta.contentType,
          metadata: meta.metadata,
          storedAt,
        };
      }

      // Idempotent re-put of identical content: keep the original blob and
      // the first-write metadata (same semantics as the in-memory adapter).
      const meta = (await readMeta(blob)) ?? {};
      return {
        ref: { scope, digest },
        size: bytes.byteLength,
        contentType: meta.contentType,
        metadata: meta.metadata,
        storedAt: meta.storedAt ?? new Date().toISOString(),
      };
    },

    async get(ref: StorageRef): Promise<Uint8Array> {
      const scope = validateScope(ref.scope);
      const blob = blobPath(rootDir, scope, ref.digest);
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(blob));
      } catch {
        throw new ObjectNotFoundError(ref);
      }
      return verifyOrThrow(ref, bytes);
    },

    async delete(ref: StorageRef): Promise<boolean> {
      const scope = validateScope(ref.scope);
      const blob = blobPath(rootDir, scope, ref.digest);
      let existed = true;
      try {
        await stat(blob);
      } catch {
        existed = false;
      }
      if (existed) {
        await rm(blob, { force: true });
        await rm(metaPath(blob), { force: true });
      }
      return existed;
    },
  };
}

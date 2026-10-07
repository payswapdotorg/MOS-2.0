/**
 * DISCLOSED TEST DOUBLE — in-memory engine-side ArtifactStorePort (ENG-003).
 *
 * ⚠ TEST DOUBLE ONLY — NEVER PRODUCTION STORAGE ⚠
 *
 * Backs the scoped-artifacts-only sandbox filesystem with an in-memory
 * map: real sha-256 digests (node:crypto), caller-supplied refs for
 * golden-corpus inputs, and versioned engine-generated outputs carrying
 * full lineage + creationMethod. It makes no persistence claim; the
 * durable artifact store is the content module's authority (CORE-004) —
 * never imported here (types come from @mos/contracts ArtifactRef only).
 */

import { createHash } from "node:crypto";

import type {
  Artifact,
  ArtifactId,
  ArtifactRef,
  Timestamp,
} from "@mos/contracts";

import type {
  EngineArtifactRecord,
  EngineArtifactStorePort,
  PersistArtifactInput,
} from "../ports/engine-runner.port.js";

/** Options for the in-memory artifact store double. */
export interface InMemoryArtifactStoreOptions {
  /** Injectable clock for resolution stamps (default: real time). */
  readonly clock?: () => Timestamp;
  /** Injectable artifact-id factory (default: sequential `artifact:engine-<n>`). */
  readonly artifactIdFactory?: (sequence: number) => string;
}

/** The in-memory artifact store: the port plus test-facing seeding helpers. */
export interface InMemoryArtifactStore extends EngineArtifactStorePort {
  /** Registers one known artifact (golden-corpus input or pre-existing). */
  registerArtifact(ref: ArtifactRef, bytes: Uint8Array): void;
  /** All stored artifact records, insertion-ordered (audit helper). */
  listArtifacts(): readonly Artifact[];
}

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function refOf(artifact: Artifact): ArtifactRef {
  return {
    artifactId: artifact.id,
    version: artifact.version,
    tenantId: artifact.tenantId,
    digest: artifact.digest,
    type: artifact.type,
    storageRef: artifact.storageRef,
    rightsRef: artifact.rightsRef,
    provenanceRef: artifact.provenanceRef,
  };
}

/**
 * Creates the DISCLOSED in-memory engine artifact store.
 */
export function createInMemoryArtifactStore(
  options: InMemoryArtifactStoreOptions = {},
): InMemoryArtifactStore {
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  const artifactIdFactory =
    options.artifactIdFactory ??
    ((sequence: number) => `artifact:engine-${sequence}`);

  /** (artifactId, version) → artifact + bytes. */
  const stored = new Map<string, { artifact: Artifact; bytes: Uint8Array }>();
  let sequence = 0;

  const keyOf = (artifactId: string, version: number): string =>
    `${artifactId}::${version}`;

  return {
    registerArtifact(ref: ArtifactRef, bytes: Uint8Array): void {
      const artifact: Artifact = {
        id: ref.artifactId,
        version: ref.version,
        tenantId: ref.tenantId,
        type: ref.type,
        digest: ref.digest,
        storageRef: ref.storageRef,
        provenanceRef: ref.provenanceRef,
        rightsRef: ref.rightsRef,
        lineage: [],
        creationMethod: "human-import",
      };
      stored.set(keyOf(ref.artifactId, ref.version), {
        artifact,
        bytes,
      });
    },

    async resolve(
      ref: ArtifactRef,
    ): Promise<EngineArtifactRecord | undefined> {
      const entry = stored.get(keyOf(ref.artifactId, ref.version));
      if (entry === undefined) {
        return undefined;
      }
      // Integrity: the requested ref's digest must match the stored bytes.
      if (ref.digest !== entry.artifact.digest) {
        return undefined;
      }
      return {
        ref: refOf(entry.artifact),
        bytes: entry.bytes,
        resolvedAt: clock(),
      };
    },

    async persist(input: PersistArtifactInput): Promise<ArtifactRef> {
      sequence += 1;
      const artifactId = artifactIdFactory(sequence) as ArtifactId;
      const digest = digestOf(input.bytes) as Artifact["digest"];
      const artifact: Artifact = {
        id: artifactId,
        version: 1 as Artifact["version"],
        tenantId: input.tenantId,
        type: input.type,
        digest,
        storageRef: `storage://in-memory/${artifactId as string}@1` as Artifact["storageRef"],
        provenanceRef: input.provenanceRef,
        rightsRef: input.rightsRef,
        lineage: [...(input.lineage ?? [])],
        creationMethod: "engine-generated",
      };
      stored.set(keyOf(artifact.id, artifact.version), {
        artifact,
        bytes: input.bytes,
      });
      const ref: ArtifactRef = refOf(artifact);
      return ref;
    },

    listArtifacts(): readonly Artifact[] {
      return [...stored.values()].map((entry) => entry.artifact);
    },
  };
}

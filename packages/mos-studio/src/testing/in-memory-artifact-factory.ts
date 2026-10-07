/**
 * DISCLOSED TEST DOUBLE — in-memory artifact factory (STUDIO-001).
 *
 * Simulates the content-module artifact authority (CORE-004, not in this
 * base) for contract tests: creates immutable `StudioArtifactRef` versions
 * with real sha-256 content digests, per-artifact version counters, closed
 * lineage enforcement (parents must already exist, tenant scope must match)
 * and an in-memory byte store. Not a production artifact store.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  ArtifactId,
  ContentDigest,
  StorageRef,
  Version,
} from "../contracts/refs.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type {
  StudioArtifactCreationInput,
  StudioArtifactCreationResult,
  StudioArtifactFactoryPort,
} from "../ports/artifact-factory.js";

/** Options for the double. */
export interface InMemoryArtifactFactoryOptions {
  readonly idFactory?: () => string;
}

interface StoredArtifact {
  readonly artifact: StudioArtifactRef;
  readonly content: Uint8Array | null;
}

/** Create the disclosed in-memory artifact factory test double. */
export function createInMemoryArtifactFactory(
  options: InMemoryArtifactFactoryOptions = {},
): StudioArtifactFactoryPort & {
  /** Test inspection: all created artifacts in creation order. */
  readonly createdArtifacts: readonly StudioArtifactRef[];
  /** Test inspection: content bytes stored for an artifact id (when content was provided). */
  contentOf(artifactId: string): Uint8Array | undefined;
} {
  const idFactory = options.idFactory ?? (() => randomUUID());
  const byId = new Map<string, StoredArtifact[]>();
  const creationOrder: StudioArtifactRef[] = [];

  return {
    get createdArtifacts(): readonly StudioArtifactRef[] {
      return creationOrder;
    },
    contentOf(artifactId: string): Uint8Array | undefined {
      const versions = byId.get(artifactId);
      return versions === undefined ? undefined : (versions[versions.length - 1]?.content ?? undefined);
    },
    async createArtifact(input: StudioArtifactCreationInput): Promise<StudioArtifactCreationResult> {
      const hasContent = input.content !== undefined;
      const hasDigest = input.precomputedDigest !== undefined;
      if (!hasContent && !hasDigest) {
        return { ok: false, error: { kind: "content-and-digest-both-missing" } };
      }
      if (hasContent && hasDigest) {
        return { ok: false, error: { kind: "content-and-digest-both-provided" } };
      }
      const content = input.content;
      for (const parent of input.parents) {
        if (!byId.has(parent.artifactId)) {
          return {
            ok: false,
            error: { kind: "invalid-lineage", reason: `unknown parent artifact ${parent.artifactId}` },
          };
        }
        if (parent.tenantId !== input.tenantId) {
          return {
            ok: false,
            error: {
              kind: "invalid-lineage",
              reason: `parent ${parent.artifactId} tenant ${parent.tenantId} differs from tenant ${input.tenantId}`,
            },
          };
        }
      }
      const artifactId = `art_${idFactory()}` as ArtifactId;
      const versions = byId.get(artifactId) ?? [];
      // Canonical branded Version (RECONCILE-C): StudioArtifactRef extends the
      // canonical ArtifactRef, so its version carries the contract brand; the
      // cast is the single brand point for this monotonic counter.
      const version = (versions.length + 1) as Version;
      const digest: ContentDigest = hasDigest
        ? (input.precomputedDigest as ContentDigest)
        : (`sha256:${createHash("sha256").update(content as Uint8Array).digest("hex")}` as ContentDigest);
      const artifact: StudioArtifactRef = Object.freeze({
        artifactId,
        version,
        tenantId: input.tenantId,
        digest,
        type: input.type,
        storageRef: input.storageRef as StorageRef,
        rightsRef: input.rightsRef,
        provenanceRef: input.provenanceRef,
        stage: input.stage,
        parentArtifactRefs: Object.freeze([...input.parents]),
        creationMethod: input.creationMethod,
      });
      versions.push({ artifact, content: content ?? null });
      byId.set(artifactId, versions);
      creationOrder.push(artifact);
      return { ok: true, artifact };
    },
  };
}

/**
 * Job-scoped artifact store view (ENG-003).
 *
 * The `filesystem: scoped-artifacts-only` policy made structural: the
 * store handed to an adapter inside its sandbox context can only
 *
 * - resolve the artifact refs the JOB declared as inputs, and
 * - resolve/persist artifacts materialized DURING this run (outputs),
 *
 * never anything else the backing store may hold. Arbitrary paths cannot
 * even be expressed — the API speaks in ArtifactRefs only. Out-of-scope
 * and unknown refs resolve to `undefined` alike (no existence leaks).
 */

import type { ArtifactRef } from "@mos/contracts";

import type {
  EngineArtifactRecord,
  EngineArtifactStorePort,
  PersistArtifactInput,
} from "../ports/engine-runner.port.js";

function sameRef(a: ArtifactRef, b: ArtifactRef): boolean {
  return (
    a.artifactId === b.artifactId &&
    a.version === b.version &&
    a.digest === b.digest
  );
}

/**
 * Creates the per-job scoped view over a backing
 * {@link EngineArtifactStorePort}.
 */
export function createJobScopedArtifactStore(
  backingStore: EngineArtifactStorePort,
  jobInputRefs: readonly ArtifactRef[],
): EngineArtifactStorePort {
  const jobInputs = [...jobInputRefs];
  const produced: ArtifactRef[] = [];

  const inScope = (ref: ArtifactRef): boolean =>
    jobInputs.some((input) => sameRef(input, ref)) ||
    produced.some((output) => sameRef(output, ref));

  return {
    async resolve(
      ref: ArtifactRef,
    ): Promise<EngineArtifactRecord | undefined> {
      if (!inScope(ref)) {
        return undefined; // out of scope ≙ unknown — no existence leaks
      }
      return backingStore.resolve(ref);
    },

    async persist(input: PersistArtifactInput): Promise<ArtifactRef> {
      const ref = await backingStore.persist(input);
      produced.push(ref);
      return ref;
    },
  };
}

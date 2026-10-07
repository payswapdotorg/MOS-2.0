/**
 * DISCLOSED TEST COMPOSITION — deterministic Studio runtime assembly for
 * contract tests (STUDIO-001).
 *
 * Builds a StudioRuntime whose ports are ALL disclosed in-memory test
 * doubles, with a deterministic clock and id factory so tests are fully
 * reproducible. NOT a production composition root — production binds the
 * ports to the real MOS modules in later waves.
 */

import { createFormatRegistryWithInitialFormats } from "../runtime/formats/initial-formats.js";
import type { FormatRegistry } from "../runtime/format-registry.js";
import { createStudioRuntime, type StudioRuntime } from "../runtime/studio-runtime.js";
import { createInMemoryOrganizationLoader } from "./in-memory-organization-loader.js";
import { createInMemoryArtifactFactory } from "./in-memory-artifact-factory.js";
import { createInMemoryTreatmentExecutor } from "./in-memory-treatment-executor.js";
import { createInMemoryCaptureSourcePort } from "../runtime/capture/in-memory-capture-source.js";
import type { InMemoryTreatmentExecutorOptions } from "./in-memory-treatment-executor.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";

/** Deterministic clock: fixed base, +1s per call. */
export function createDeterministicClock(baseEpochMs = Date.UTC(2026, 0, 1, 12, 0, 0)): () => string {
  let tick = 0;
  return () => new Date(baseEpochMs + (tick++) * 1000).toISOString();
}

/** Deterministic id factory: `t-<prefix>-<counter>`. */
export function createDeterministicIdFactory(prefix: string): () => string {
  let counter = 0;
  return () => `t-${prefix}-${String(++counter).padStart(4, "0")}`;
}

/** The fully-capable test organization (declares every capability the initial formats require). */
export const TEST_ORGANIZATION = {
  id: "org-test-full",
  version: 3,
  declaredCapabilities: [
    "compose_reaction",
    "render_timeline",
    "transcribe_audio",
    "mix_audio",
    "compose_video",
    "evaluate_content",
  ],
} as const;

/** Assemble a test runtime bound to disclosed in-memory doubles. */
export function composeTestRuntime(options: {
  /** Custom format registry (defaults to the three initial formats). */
  readonly formatRegistry?: FormatRegistry;
  readonly treatmentFailWith?: InMemoryTreatmentExecutorOptions["failWith"];
  readonly organizations?: readonly {
    id: string;
    version: number;
    declaredCapabilities: readonly string[];
  }[];
  readonly baseEpochMs?: number;
} = {}): {
  readonly runtime: StudioRuntime;
  readonly clock: () => string;
  /** The shared factory the runtime and treatment executor use (test-created artifacts close the lineage). */
  readonly artifactFactory: StudioArtifactFactoryPort & { readonly createdArtifacts: readonly import("../contracts/studio-artifact-package.js").StudioArtifactRef[] };
} {
  const clock = createDeterministicClock(options.baseEpochMs);
  // One shared artifact factory: treatments create successors whose parents
  // are artifacts created by the runtime's factory (closed lineage §6).
  const artifactFactory = createInMemoryArtifactFactory({ idFactory: createDeterministicIdFactory("art") });
  const runtime = createStudioRuntime({
    formatRegistry: options.formatRegistry ?? createFormatRegistryWithInitialFormats(),
    organizationLoader: createInMemoryOrganizationLoader({
      organizations: options.organizations ?? [TEST_ORGANIZATION],
    }),
    artifactFactory,
    treatmentExecutor: createInMemoryTreatmentExecutor({
      artifactFactory,
      clock,
      failWith: options.treatmentFailWith,
    }),
    captureSourcePort: createInMemoryCaptureSourcePort({ now: clock, fixedTakeSeconds: 42 }),
    clock,
    idFactory: createDeterministicIdFactory("id"),
  });
  return { runtime, clock, artifactFactory };
}

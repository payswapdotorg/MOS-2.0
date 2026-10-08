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
import { createInMemoryOrganizationSource } from "./in-memory-organization-source.js";
import { createStudioOrganizationLoader } from "../runtime/organization-loading/studio-organization-loader.js";
import { createInMemoryArtifactFactory } from "./in-memory-artifact-factory.js";
import { createInMemoryTreatmentExecutor } from "./in-memory-treatment-executor.js";
import { createInMemoryCaptureSourcePort } from "../runtime/capture/in-memory-capture-source.js";
import { createStudioPackagingAuthority } from "../runtime/packaging/packaging-authority.js";
import type { StudioArtifactPackagingPort } from "../ports/artifact-packaging.port.js";
import type { InMemoryTreatmentExecutorOptions } from "./in-memory-treatment-executor.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";
import type { Timestamp } from "../contracts/refs.js";
import {
  composeRealParticipantAuthorities,
  type RealParticipantAuthorities,
} from "./real-participant-authorities.js";

/** Deterministic clock: fixed base, +1s per call. */
export function createDeterministicClock(baseEpochMs = Date.UTC(2026, 0, 1, 12, 0, 0)): () => Timestamp {
  let tick = 0;
  // The cast is the single clock-seam brand point: the canonical Timestamp
  // is a branded string; every produced value is a real ISO-8601 string.
  return () => new Date(baseEpochMs + (tick++) * 1000).toISOString() as Timestamp;
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

// ---------------------------------------------------------------------------
// STUDIO-014: composition-handle lookup — reach, THROUGH a composed runtime
// instance, the exact packaging authority + REAL participant authorities it
// was composed with. The operator product surface composes over these ports;
// tests use these lookups to prove the runtime's outputs are browsable
// through THE authority it composed through (and that consent revocations
// recorded in the REAL rights authority bite at the runtime's operator
// actions). Every lookup of an unknown runtime fails LOUD — there is never a
// silent parallel authority answering.
// ---------------------------------------------------------------------------

const compositionHandlesByRuntime = new WeakMap<
  StudioRuntime,
  { readonly authorities: RealParticipantAuthorities; readonly packaging: StudioArtifactPackagingPort }
>();

/** The packaging authority a fixture-composed runtime composes through (STUDIO-013/014). */
export function runtimePackagingOf(runtime: StudioRuntime): StudioArtifactPackagingPort {
  const handles = compositionHandlesByRuntime.get(runtime);
  if (handles === undefined) {
    throw new Error("runtimePackagingOf: the runtime was not composed by composeTestRuntime");
  }
  return handles.packaging;
}

/** The REAL participant authorities behind a fixture-composed runtime (STUDIO-006). */
export function runtimeAuthoritiesOf(runtime: StudioRuntime): RealParticipantAuthorities {
  const handles = compositionHandlesByRuntime.get(runtime);
  if (handles === undefined) {
    throw new Error("runtimeAuthoritiesOf: the runtime was not composed by composeTestRuntime");
  }
  return handles.authorities;
}

/** Assemble a test runtime bound to disclosed in-memory doubles + the REAL participant authorities (STUDIO-006). */
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
  /**
   * STUDIO-013/014 composition-sharing seams (all optional, defaulted):
   * share ONE clock/authorities/packaging authority/artifact factory with a
   * co-composed editing stack, and observe the runtime through a session
   * directory (the operator product surface's listing source).
   */
  readonly clock?: () => Timestamp;
  readonly authorities?: RealParticipantAuthorities;
  readonly packaging?: StudioArtifactPackagingPort;
  readonly artifactFactory?: StudioArtifactFactoryPort & {
    readonly createdArtifacts: readonly import("../contracts/studio-artifact-package.js").StudioArtifactRef[];
  };
  readonly sessionDirectory?: import("../ports/session-directory.port.js").StudioSessionDirectory;
} = {}): {
  readonly runtime: StudioRuntime;
  readonly clock: () => Timestamp;
  /** The shared factory the runtime and treatment executor use (test-created artifacts close the lineage). */
  readonly artifactFactory: StudioArtifactFactoryPort & { readonly createdArtifacts: readonly import("../contracts/studio-artifact-package.js").StudioArtifactRef[] };
  /** STUDIO-006: the REAL identity + rights authorities behind the ports. */
  readonly authorities: RealParticipantAuthorities;
  /** STUDIO-013: the canonical packaging authority the runtime composes through. */
  readonly packaging: StudioArtifactPackagingPort;
} {
  const clock = options.clock ?? createDeterministicClock(options.baseEpochMs);
  // STUDIO-006: REAL @mos/identity + @mos/rights in-memory repositories behind
  // the studio-owned participant ports (adapters + composition disclosed in
  // testing/participant-authority-adapters.ts + real-participant-authorities.ts).
  const authorities = options.authorities ?? composeRealParticipantAuthorities({ now: clock });
  // One shared artifact factory: treatments create successors whose parents
  // are artifacts created by the runtime's factory (closed lineage §6).
  const artifactFactory =
    options.artifactFactory ?? createInMemoryArtifactFactory({ idFactory: createDeterministicIdFactory("art") });
  // STUDIO-013: the canonical packaging authority behind the runtime (THE
  // packaging path — every session package version is composed through it).
  const packaging = options.packaging ?? createStudioPackagingAuthority({ now: clock });
  const runtime = createStudioRuntime({
    formatRegistry: options.formatRegistry ?? createFormatRegistryWithInitialFormats(),
    // STUDIO-007: the REAL studio loader over a disclosed in-memory source double
    // (validation/verdicts/caching live in the loader; only the source is doubled).
    organizationLoader: createStudioOrganizationLoader({
      source: createInMemoryOrganizationSource({
        organizations: options.organizations ?? [TEST_ORGANIZATION],
      }),
    }),
    artifactFactory,
    treatmentExecutor: createInMemoryTreatmentExecutor({
      artifactFactory,
      clock,
      failWith: options.treatmentFailWith,
    }),
    captureSourcePort: createInMemoryCaptureSourcePort({ now: clock, fixedTakeSeconds: 42 }),
    participantIdentityPort: authorities.participantIdentityPort,
    participantConsentPort: authorities.participantConsentPort,
    packaging,
    sessionDirectory: options.sessionDirectory,
    clock,
    idFactory: createDeterministicIdFactory("id"),
  });
  // STUDIO-014: register the composition handles so operator-surface tests
  // can reach THEM through the runtime instance (see runtimePackagingOf).
  compositionHandlesByRuntime.set(runtime, { authorities, packaging });
  return { runtime, clock, artifactFactory, authorities, packaging };
}

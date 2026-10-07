/**
 * The disclosed pawn-stack composition seam (LAB-013) — NOT a production
 * composition root.
 *
 * Wires the REAL-for-contract-testing authorities with the disclosed
 * in-memory seam doubles:
 * - REAL @mos/rights: the in-memory rights repository + THE REAL
 *   `evaluateRights` rule (§27 cascade), imported by relative dist path
 *   (W5-C/W6-C precedent — @mos/rights' exports map resolves bare runtime
 *   specifiers to untranspiled source; the package stays a TYPE-ONLY import
 *   in src/);
 * - REAL @mos/content: the in-memory artifact repository (the content
 *   authority behind the artifact-source seam, one-line delegation);
 * - DISCLOSED DOUBLES: the agent-stack registries/executor, the engine
 *   runner, the transform source — the composition root replaces them with
 *   the REAL @mos/agents/@mos/agent-runtime/@mos/engines/@mos/lab adapters
 *   behind the SAME port types (compat/pawn-real-stack.test.ts proves that
 *   wiring end-to-end);
 * - the ten §9 pawn bodies registered through the pawn execution port.
 */

import { evaluateRights } from "../../../mos-rights/dist/index.js";
import { createInMemoryRightsRepository } from "../../../mos-rights/dist/index.js";
import { createInMemoryArtifactRepository } from "../../../mos-content/dist/index.js";
import type { ArtifactRepository } from "@mos/content";
import type { RightsGrant } from "@mos/rights";
import type {
  ArtifactId,
  ArtifactRef,
  ArtifactType,
  CapabilityId,
  ContentDigest,
  PolicyRef,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from "@mos/contracts";

import { TRANSFORM_PAWN_BODIES } from "../bodies/transform-pawn-bodies.js";
import {
  createInMemoryEngineRunner,
} from "../adapters/in-memory-engine-runner.js";
import type {
  InMemoryEngineRunnerDouble,
  InMemoryRunnerRoute,
} from "../adapters/in-memory-engine-runner.js";
import {
  createInMemoryPawnBodyRegistry,
  createInMemoryPawnInstanceRegistry,
  createInMemoryPawnModelRuntime,
  createInMemoryPawnInstanceExecutor,
} from "../adapters/in-memory-agent-stack.js";
import type { PawnInstanceExecutorPort } from "../ports/agent-stack.ports.js";
import {
  createInMemoryTransformSource,
} from "../adapters/in-memory-transform-source.js";
import type {
  InMemoryTransformSourceDouble,
  PawnTransformDefinitionSeed,
} from "../adapters/in-memory-transform-source.js";
import { createInMemoryPawnRightsGate } from "../adapters/in-memory-pawn-rights-gate.js";
import {
  createInMemoryPawnExecutionRuntime,
} from "../adapters/in-memory-pawn-execution.js";
import type { InMemoryPawnExecutionRuntime } from "../adapters/in-memory-pawn-execution.js";
import {
  createInMemoryPawnOrganizationRegistry,
} from "../adapters/in-memory-pawn-organization.js";
import type { PawnExecutionPort } from "../ports/pawn-execution.port.js";
import type { TransformPawnOrganizationPort } from "../ports/pawn-organization.port.js";
import type { PawnArtifactSourcePort } from "../ports/artifact-source.port.js";

// ---------------------------------------------------------------------------
// The deterministic world
// ---------------------------------------------------------------------------

/** Fixed clock for deterministic tests. */
export const FIXED_NOW = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;

/** The primary test tenant. */
export const TENANT_ALPHA: TenantId = "tenant:alpha" as TenantId;
/** The foreign test tenant (no existence leaks). */
export const TENANT_BETA: TenantId = "tenant:beta" as TenantId;

/** Tenant scopes. */
export const SCOPE_ALPHA: TenantScope = { tenantId: TENANT_ALPHA };
export const SCOPE_BETA: TenantScope = { tenantId: TENANT_BETA };

/** The identity principal executing pawn tasks (the rights grantee). */
export const PRINCIPAL_PRODUCER = "identity:producer-1";

/** The §30 actor fixture. */
export const ACTOR_PRODUCER = { kind: "identity", principalId: PRINCIPAL_PRODUCER } as const;

/** The test model catalog (the composition seam owns it — lock rule 9). */
export const PAWN_MODEL_CATALOG = [
  {
    modelRef: "mos-model:pawn-default" as never,
    runtimeRef: "mos-runtime:in-memory-agent" as never,
    description: "Composition-seam pawn model (disclosed test catalog)",
  },
];

// ---------------------------------------------------------------------------
// Fixtures: grants, artifacts, transform definitions
// ---------------------------------------------------------------------------

function digestOf(seed: string): ContentDigest {
  const hex = Array.from({ length: 64 }, (_, index) =>
    ((seed.charCodeAt(index % seed.length) + index) % 16).toString(16),
  ).join("");
  return `sha256:${hex}` as ContentDigest;
}

/** Registers the fixture grant views: the producer may transform the sources. */
function registerFixtureGrants(
  rights: ReturnType<typeof createInMemoryRightsRepository>,
): void {
  const grant = rights.grantRights({
    scope: SCOPE_ALPHA,
    id: "rights:producer-source-grant" as RightsRef,
    grantee: PRINCIPAL_PRODUCER as never,
    actions: ["use", "transform", "derive"],
    subjectRefs: [
      "artifact:source-video-1",
      "artifact:source-audio-1",
      "artifact:reaction-capture-1",
    ],
    sourceRefs: ["consent:producer-1"],
    terms: {
      attributionRequired: true,
      commercialUseAllowed: true,
      derivationAllowed: true,
      notes: null,
    },
  });
  if ("error" in grant) {
    throw new Error(`fixture grant failed: ${JSON.stringify(grant)}`);
  }
  // The foreign tenant carries its own grant so the fixture artifacts there
  // register cleanly (cross-tenant tests exercise the SCOPE, not a broken
  // rights fixture).
  const betaGrant = rights.grantRights({
    scope: SCOPE_BETA,
    id: "rights:beta-source-grant" as RightsRef,
    grantee: "identity:beta-producer" as never,
    actions: ["use", "transform"],
    subjectRefs: ["artifact:beta-video-1"],
    sourceRefs: ["consent:beta-producer"],
    terms: {
      attributionRequired: true,
      commercialUseAllowed: false,
      derivationAllowed: false,
      notes: null,
    },
  });
  if ("error" in betaGrant) {
    throw new Error(`fixture beta grant failed: ${JSON.stringify(betaGrant)}`);
  }
}

interface FixtureArtifact {
  readonly artifactId: ArtifactId;
  readonly type: ArtifactType;
  readonly digestSeed: string;
}

const ALPHA_ARTIFACTS: readonly FixtureArtifact[] = [
  { artifactId: "artifact:source-video-1" as ArtifactId, type: "video", digestSeed: "source-video-one" },
  { artifactId: "artifact:source-audio-1" as ArtifactId, type: "audio", digestSeed: "source-audio-one" },
  { artifactId: "artifact:reaction-capture-1" as ArtifactId, type: "video", digestSeed: "reaction-capture-one" },
];

const BETA_ARTIFACTS: readonly FixtureArtifact[] = [
  { artifactId: "artifact:beta-video-1" as ArtifactId, type: "video", digestSeed: "beta-video-one" },
];

/** Registers the fixture artifacts through the REAL content repository. */
function registerFixtureArtifacts(
  repository: ArtifactRepository,
  scope: TenantScope,
  artifacts: readonly FixtureArtifact[],
  rightsRef: RightsRef,
): void {
  for (const artifact of artifacts) {
    const registered = repository.registerArtifact({
      scope,
      artifact: {
        id: artifact.artifactId,
        type: artifact.type,
        digest: digestOf(artifact.digestSeed),
        storageRef: `storage://fixtures/${artifact.artifactId as string}` as StorageRef,
        provenanceRef: `provenance:fixture/${artifact.artifactId as string}` as ProvenanceRef,
        rightsRef,
        lineage: [],
        creationMethod: "reference",
      },
    });
    if (registered === null || "error" in registered) {
      throw new Error(`fixture artifact registration failed: ${JSON.stringify(registered)}`);
    }
  }
}

/** The artifact ref fixture of one registered artifact. */
export function artifactRefOf(
  artifactId: string,
  digestSeed: string,
  type: ArtifactType,
  tenantId: TenantId = TENANT_ALPHA,
  rightsRef: string = "rights:producer-source-grant",
): ArtifactRef {
  return {
    artifactId: artifactId as ArtifactRef["artifactId"],
    version: 1 as Version,
    tenantId,
    digest: digestOf(digestSeed),
    type,
    storageRef: `storage://fixtures/${artifactId}` as ArtifactRef["storageRef"],
    rightsRef: rightsRef as ArtifactRef["rightsRef"],
    provenanceRef: `provenance:fixture/${artifactId}` as ArtifactRef["provenanceRef"],
  };
}

/** Ready-made input refs of the fixture artifacts. */
export const SOURCE_VIDEO_REF = artifactRefOf("artifact:source-video-1", "source-video-one", "video");
export const SOURCE_AUDIO_REF = artifactRefOf("artifact:source-audio-1", "source-audio-one", "audio");
export const REACTION_CAPTURE_REF = artifactRefOf("artifact:reaction-capture-1", "reaction-capture-one", "video");
export const BETA_VIDEO_REF = artifactRefOf(
  "artifact:beta-video-1",
  "beta-video-one",
  "video",
  TENANT_BETA,
  "rights:beta-source-grant",
);

function capability(id: string, version = 1): { capabilityId: CapabilityId; version: Version } {
  return { capabilityId: id as CapabilityId, version: version as Version };
}

/** The fixture transform definitions (the LAB-011/012 vocabulary seeds). */
const TRANSFORM_SEEDS: readonly PawnTransformDefinitionSeed[] = [
  {
    id: "transform:clip-highlights" as TransformId,
    tenantId: TENANT_ALPHA,
    version: 1 as Version,
    kind: "clip",
    inputTypes: ["video"],
    outputTypes: ["video"],
    parameters: { type: "object", properties: { clipCount: { type: "number" } } },
    capabilityRequirements: [capability("rank_clip_candidates")],
    evaluator: "evaluator:transform/clip-highlights" as never,
    costModel: { basis: "per-invocation", amount: 0.1, currency: "USD" },
    latencyModel: { p50Ms: 2_000, p95Ms: 8_000, p99Ms: 20_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:clip-parents"],
  },
  {
    id: "transform:reaction-pip" as TransformId,
    tenantId: TENANT_ALPHA,
    version: 1 as Version,
    kind: "reaction",
    inputTypes: ["video"],
    outputTypes: ["video"],
    parameters: { type: "object", properties: { layout: { type: "string" } } },
    capabilityRequirements: [capability("compose_reaction")],
    evaluator: "evaluator:transform/reaction-pip" as never,
    costModel: { basis: "per-invocation", amount: 0.2, currency: "USD" },
    latencyModel: { p50Ms: 5_000, p95Ms: 20_000, p99Ms: 60_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:reaction-parents"],
  },
  {
    id: "transform:podcast-episode" as TransformId,
    tenantId: TENANT_ALPHA,
    version: 1 as Version,
    kind: "podcast",
    inputTypes: ["audio"],
    outputTypes: ["audio"],
    parameters: { type: "object", properties: { questionCount: { type: "number" } } },
    capabilityRequirements: [capability("generate_questions")],
    evaluator: "evaluator:transform/podcast-episode" as never,
    costModel: { basis: "per-invocation", amount: 0.3, currency: "USD" },
    latencyModel: { p50Ms: 1_500, p95Ms: 6_000, p99Ms: 15_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:podcast-parents"],
  },
  {
    id: "transform:question-pack" as TransformId,
    tenantId: TENANT_ALPHA,
    version: 1 as Version,
    kind: "podcast",
    inputTypes: ["audio"],
    outputTypes: ["text"],
    parameters: { type: "object", properties: { questionCount: { type: "number" } } },
    capabilityRequirements: [capability("transcribe_audio"), capability("generate_questions")],
    evaluator: "evaluator:transform/question-pack" as never,
    costModel: { basis: "per-invocation", amount: 0.35, currency: "USD" },
    latencyModel: { p50Ms: 3_000, p95Ms: 12_000, p99Ms: 30_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:question-pack-parents"],
  },
  {
    id: "transform:dubbed-track" as TransformId,
    tenantId: TENANT_ALPHA,
    version: 1 as Version,
    kind: "translation-dubbing",
    inputTypes: ["audio"],
    outputTypes: ["audio"],
    parameters: { type: "object", properties: { targetLanguage: { type: "string" } } },
    capabilityRequirements: [capability("generate_voice")],
    evaluator: "evaluator:transform/dubbed-track" as never,
    costModel: { basis: "per-invocation", amount: 0.4, currency: "USD" },
    latencyModel: { p50Ms: 8_000, p95Ms: 30_000, p99Ms: 90_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:dubbing-parents"],
  },
  {
    id: "transform:noop-repost" as TransformId,
    tenantId: TENANT_ALPHA,
    version: 1 as Version,
    kind: "no-op-repost",
    inputTypes: ["video", "audio"],
    outputTypes: ["video", "audio"],
    parameters: { type: "object" },
    capabilityRequirements: [],
    evaluator: "evaluator:transform/noop-repost" as never,
    costModel: { basis: "per-invocation", amount: 0, currency: "USD" },
    latencyModel: { p50Ms: 100, p95Ms: 500, p99Ms: 1_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:identity"],
  },
];

// ---------------------------------------------------------------------------
// The composed stack
// ---------------------------------------------------------------------------

/** Options for {@link composePawnStack}. */
export interface ComposePawnStackOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => Timestamp;
  /** Scripted engine-runner routes (typed failures / outputs / metrics). */
  readonly engineRoutes?: Readonly<Record<string, InMemoryRunnerRoute>>;
  /** Extra transform definitions seeded into the disclosed source double. */
  readonly extraTransforms?: readonly PawnTransformDefinitionSeed[];
  /** Overrides the grant view of the rights gate (adversarial tests). */
  readonly grantView?: readonly RightsGrant[];
  /** Replaces the composed executor double (failure-path tests). */
  readonly executorOverride?: PawnInstanceExecutorPort;
}

/** The composed pawn stack (the disclosed in-memory world). */
export interface ComposedPawnStack {
  /** The pawn lifecycle + execution port (the ten bodies registered). */
  readonly execution: PawnExecutionPort;
  /** The pawn organization composition port. */
  readonly organizations: TransformPawnOrganizationPort;
  /** The disclosed agent-stack doubles (inspection). */
  readonly doubles: {
    readonly bodies: ReturnType<typeof createInMemoryPawnBodyRegistry>;
    readonly modelBoundary: ReturnType<typeof createInMemoryPawnModelRuntime>;
    readonly executor: ReturnType<typeof createInMemoryPawnInstanceExecutor>;
    readonly engineRunner: InMemoryEngineRunnerDouble;
    readonly transforms: InMemoryTransformSourceDouble;
  };
  /** The REAL rights repository (fixture grants). */
  readonly rights: ReturnType<typeof createInMemoryRightsRepository>;
  /** The REAL content repository (fixture artifacts). */
  readonly content: ArtifactRepository;
  /** The runtime composition handle (org-citation wiring). */
  readonly runtime: InMemoryPawnExecutionRuntime;
}

/** Composes the disclosed pawn stack with the ten §9 bodies registered. */
export function composePawnStack(
  options: ComposePawnStackOptions = {},
): ComposedPawnStack {
  const now = options.now ?? FIXED_NOW;

  // REAL rights authority + the REAL evaluation rule (injected into the gate).
  const rights = createInMemoryRightsRepository({ now });
  registerFixtureGrants(rights);

  // REAL content authority behind the artifact-source seam.
  const content = createInMemoryArtifactRepository({ rights: { getRights: (ref) => rights.getRights(ref) }, now });
  registerFixtureArtifacts(content, SCOPE_ALPHA, ALPHA_ARTIFACTS, "rights:producer-source-grant" as RightsRef);
  registerFixtureArtifacts(content, SCOPE_BETA, BETA_ARTIFACTS, "rights:beta-source-grant" as RightsRef);
  const artifactSource: PawnArtifactSourcePort = {
    async resolve(scope, ref) {
      const artifact = content.getArtifact(scope, ref.artifactId, ref.version as number);
      if (artifact === null) return null;
      return {
        artifactId: artifact.id,
        version: artifact.version,
        tenantId: artifact.tenantId,
        type: artifact.type,
        digest: artifact.digest,
        rightsRef: artifact.rightsRef,
      };
    },
  };

  // Disclosed agent-stack doubles (the REAL packages replace them at the
  // composition root behind the same seam types).
  const bodies = createInMemoryPawnBodyRegistry();
  const [defaultCatalogModel] = PAWN_MODEL_CATALOG;
  const modelBoundary = createInMemoryPawnModelRuntime({
    models: PAWN_MODEL_CATALOG,
    defaultModelRef: defaultCatalogModel?.modelRef,
    now,
  });
  const instances = createInMemoryPawnInstanceRegistry({
    bodyRegistry: bodies,
    modelRuntime: modelBoundary,
    instanceIdPrefix: "pawn-instance",
  });
  const executor = options.executorOverride ?? createInMemoryPawnInstanceExecutor({ now });

  // Disclosed engine runner double.
  const engineRunner = createInMemoryEngineRunner({ now, routes: options.engineRoutes });

  // Disclosed transform source double (LAB-011/012 vocabulary seeds).
  const transforms = createInMemoryTransformSource({
    definitions: [...TRANSFORM_SEEDS, ...(options.extraTransforms ?? [])],
  });

  // The rights gate over the REAL evaluation rule.
  const rightsGate = createInMemoryPawnRightsGate({ evaluate: evaluateRights, now });
  rightsGate.registerGrantView(
    SCOPE_ALPHA,
    options.grantView ?? rights.listRightsGrants(SCOPE_ALPHA),
  );

  // The pawn execution runtime + organization registry, wired together (the
  // org registry's body view and the runtime's org-citation source close over
  // each other through a lazy ref — both ports are created exactly once).
  let executionRef: PawnExecutionPort | undefined;
  const organizations = createInMemoryPawnOrganizationRegistry({
    listPawnBodies: () => executionRef?.listPawnBodies() ?? [],
  });
  const runtime = createInMemoryPawnExecutionRuntime({
    bodyRegistry: bodies,
    instances,
    executor,
    engineRunner,
    transformSource: transforms,
    artifactSource,
    rightsGate,
    organizationSource: {
      get: (scope, organizationId, version) =>
        organizations.getPawnOrganization(scope, organizationId, version),
    },
    now,
  });
  const execution = runtime.execution;
  executionRef = execution;

  // The ten §9 pawn bodies registered through the port.
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    execution.registerPawnBody(pawn);
  }

  return {
    execution,
    organizations,
    doubles: { bodies, modelBoundary, executor, engineRunner, transforms },
    rights,
    content,
    runtime,
  };
}

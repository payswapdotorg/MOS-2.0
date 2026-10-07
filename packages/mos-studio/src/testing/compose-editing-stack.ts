/**
 * DISCLOSED TEST COMPOSITION — the STUDIO-008 editing stack (W8-C).
 *
 * Composes the REAL sibling packages behind the studio's editing surface:
 * - the W7-B Editor Pawn through the REAL `@mos/production` surfaces
 *   (TRANSFORM_PAWN_BODIES registered into production's in-memory pawn
 *   execution runtime over the REAL `@mos/agents` body registry + the REAL
 *   `@mos/agent-runtime` instance registry — THE single model boundary is
 *   configured HERE at the composition seam and is NEVER asked by the
 *   editing surface: the editor pawn is deterministic);
 * - the REAL `@mos/engines` in-memory runner (registry + artifact store +
 *   job event sink + the disclosed test-double engine adapter) behind
 *   production's runner seam — EngineJobs for the deterministic edit
 *   operations really flow through the policy-faithful sandbox, and a
 *   configured typed adapter failure passes through VERBATIM;
 * - the REAL `@mos/rights` repository + evaluation rule behind BOTH studio
 *   gates: the §15 participant-consent port AND production's pawn rights
 *   gate (transform grants registered for the editing actor);
 * - the studio-side artifact factory (disclosed in-memory double) wrapped
 *   so every created artifact also registers in the engines artifact
 *   store + resolves in production's artifact-source seam view, and each
 *   creation records a REAL derived-work grant (transform over the new
 *   version, derivationAllowed terms) for the disclosed editing principal
 *   so chained pawn executions (the final assembly over created
 *   intermediates) pass the REAL rights gate.
 *
 * NOT a production composition root — the TL composition point binds
 * durable stores, the real transform registry, real engines and the real
 * content authority behind the same studio-owned ports.
 *
 * RUNTIME IMPORT NOTE: `@mos/agents` / `@mos/agent-runtime` /
 * `@mos/production` / `@mos/engines` export runtime entrypoints from built
 * `dist/index.js`; bare specifiers resolve after `tsc -b` (the studio's
 * project references guarantee the build order). `@mos/rights` resolves
 * its runtime condition at untranspiled source, so it keeps the W2-C
 * relative-dist import.
 */

import { createInMemoryAgentBodyRegistry } from "@mos/agents";
import {
  createInMemoryAgentInstanceRegistry,
  createInMemoryModelRuntime,
  createSubstrateInstanceExecutor,
  createInMemoryAgentRuntimeSubstrateDouble,
} from "@mos/agent-runtime";
import {
  createInMemoryEngineRegistry,
  createInMemoryEngineRunner,
  createInMemoryArtifactStore,
  createInMemoryJobEventSink,
  createTestDoubleEngineAdapter,
} from "@mos/engines";
import type { InMemoryJobEventSink, InMemoryArtifactStore } from "@mos/engines";
import {
  TRANSFORM_PAWN_BODIES,
  createInMemoryPawnExecutionRuntime,
  createInMemoryPawnRightsGate,
  createInMemoryPawnOrganizationRegistry,
  createInMemoryTransformSource,
} from "@mos/production";
import type {
  InMemoryTransformSourceDouble,
  PawnArtifactSourcePort,
  PawnExecutionId,
  PawnExecutionPort,
  PawnOrganizationSource,
  PawnRightsEvaluator,
} from "@mos/production";
import type {
  CapabilityId,
  EngineId,
  EngineJobId,
  EvaluatorRef,
  ModelRef,
  RuntimeRef,
  Version,
} from "@mos/contracts";
import { createInMemoryRightsRepository, evaluateRights } from "../../../mos-rights/dist/index.js";
import type { RightsRepository } from "@mos/rights";

import { createInMemoryArtifactFactory } from "./in-memory-artifact-factory.js";
import { createEditingCompositionRuntime } from "../runtime/editing/editing-composition-runtime.js";
import type { EditingCompositionPort } from "../ports/editing-composition.port.js";
import { createParticipantConsentPortFromRightsRepository, bridge } from "./participant-authority-adapters.js";
import { createDeterministicClock, createDeterministicIdFactory } from "./compose-runtime-for-tests.js";
import type { StudioArtifactPackage, StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type {
  EditGraphId,
  EditingSessionId,
  ProvenanceRef,
  RightsRef,
  StudioArtifactPackageId,
  TenantId,
  Timestamp,
} from "../contracts/refs.js";
import {
  buildEditingSourcePackage,
  EDITING_ORGANIZATION_REF,
  EDITING_SOURCE_RIGHTS_REF,
  EDITING_STACK_TENANT,
  EDITING_TRANSFORM_APPLICATION,
} from "./editing-fixtures.js";

/** Options of {@link composeEditingStack}. */
export interface ComposeEditingStackOptions {
  readonly now?: () => Timestamp;
  /** Configured typed failure for the disclosed timeline-renderer engine double. */
  readonly engineFailure?: { readonly code: string; readonly message: string; readonly retriable: boolean };
}

/** The composed editing stack (+ inspection handles for the tests). */
export interface EditingStack {
  readonly editing: EditingCompositionPort;
  /** The tenant the stack registers its fixtures under (org/transform/grants). */
  readonly tenantId: TenantId;
  readonly pawnExecution: PawnExecutionPort;
  readonly artifactFactory: ReturnType<typeof createInMemoryArtifactFactory>;
  readonly jobEvents: InMemoryJobEventSink;
  readonly engineArtifactStore: InMemoryArtifactStore;
  readonly transformSource: InMemoryTransformSourceDouble;
  readonly rightsRepository: RightsRepository;
  readonly now: () => Timestamp;
  /** Records a REAL transform rights grant for one editing actor over subjects. */
  grantTransformRights(input: {
    readonly tenantId: TenantId;
    readonly grantee: string;
    readonly subjectRefs: readonly string[];
  }): void;
  /** Creates one source artifact through the shared factory (auto-registered everywhere). */
  createSourceArtifact(input: {
    readonly tenantId: TenantId;
    readonly type: StudioArtifactRef["type"];
    readonly stage: StudioArtifactRef["stage"];
    readonly content: string;
    readonly rightsRef?: string;
  }): Promise<StudioArtifactRef>;
  /** Assembles a minimal source package record over given artifacts (test fixture). */
  buildSourcePackage(input: {
    readonly tenantId: TenantId;
    readonly sessionId: string;
    readonly packageId: string;
    readonly rawArtifacts: readonly StudioArtifactRef[];
    readonly intermediateArtifacts: readonly StudioArtifactRef[];
    readonly finalArtifacts: readonly StudioArtifactRef[];
    readonly consentRefs?: StudioArtifactPackage["consent"]["participantConsentRefs"];
  }): StudioArtifactPackage;
}

/** A complete engine manifest for the fictional-but-plausible timeline renderer. */
function timelineRendererManifest(): Record<string, unknown> {
  return {
    id: "engine:timeline-renderer" as EngineId,
    version: 1 as Version,
    capabilityIds: ["render_timeline" as CapabilityId],
    adapterRef: "adapter:engine:timeline-renderer@1",
    inputContract: { type: "object" },
    outputContract: { type: "object" },
    resources: { cpuCores: 1, gpuUnits: 1, memoryMb: 256, timeoutMs: 60_000 },
    deterministic: true,
    license: {
      code: { identifier: "MIT", status: "cleared" },
      model: { identifier: "CC-BY-4.0", status: "cleared" },
      data: { identifier: "CC-BY-4.0", status: "cleared" },
    },
    security: {
      sandboxed: true,
      networkAccess: "denied",
      filesystemScope: "scoped-artifacts-only",
    },
    provenance: "provenance:engine:timeline-renderer@1",
    benchmark: {
      id: "benchmark:timeline-renderer@1",
      capabilityVersion: 1 as Version,
      engineVersion: 1 as Version,
      benchmarkCorpusRef: "corpus:studio-editing@1",
      evaluatorVersion: 1 as Version,
      metrics: { score: 0.9 },
      cost: { amount: 0.01, currency: "USD" },
      latency: 1000,
      licenseStatus: "cleared",
      result: "passed",
    },
    activationStatus: "active",
    benchmarkEvidence: undefined,
    modelLicense: undefined,
    dataLicense: undefined,
  };
}

/** Compose the editing stack (disclosed test composition, NOT a production root). */
export function composeEditingStack(
  options: ComposeEditingStackOptions = {},
): EditingStack {
  const now = options.now ?? createDeterministicClock();
  const tenantId = EDITING_STACK_TENANT;
  const scope = { tenantId };

  // ---- The REAL rights authority behind BOTH gates ----
  // (the repository + evaluation rule resolve through the W2-C relative-dist
  // import; the gate evaluator is bridged once at this documented seam —
  // the evaluation rule itself is the REAL @mos/rights rule, never doubled)
  const rightsRepository = createInMemoryRightsRepository({ now: now as () => string });
  const participantConsentPort = createParticipantConsentPortFromRightsRepository(rightsRepository);
  const rightsGate = createInMemoryPawnRightsGate({
    evaluate: evaluateRights as unknown as PawnRightsEvaluator,
    now,
  });
  const grantTransformRights = (input: {
    readonly tenantId: TenantId;
    readonly grantee: string;
    readonly subjectRefs: readonly string[];
  }): void => {
    const granted = rightsRepository.grantRights({
      scope: bridge<never>({ tenantId: String(input.tenantId) }),
      id: bridge<never>(`grant:studio-editing-${input.grantee}-${input.subjectRefs.length}`),
      grantee: bridge<never>(input.grantee),
      actions: ["use", "transform"] as never,
      subjectRefs: input.subjectRefs.map((ref) => bridge<never>(ref)),
      sourceRefs: [bridge<never>("consent:studio-editing-seam")],
      terms: {
        attributionRequired: true,
        commercialUseAllowed: false,
        derivationAllowed: true,
        notes: null,
      } as never,
    });
    if (granted !== null && "error" in granted) {
      throw new Error(`editing stack rights grant rejected: ${JSON.stringify(granted)}`);
    }
    rightsGate.registerGrantView(
      { tenantId: bridge<never>(String(input.tenantId)) },
      rightsRepository.listRightsGrants({ tenantId: bridge<never>(String(input.tenantId)) } as never),
    );
  };

  // ---- The studio-side artifact factory, wrapped for engine-store registration ----
  const innerFactory = createInMemoryArtifactFactory({
    idFactory: createDeterministicIdFactory("edit-art"),
  });
  const engineArtifactStore = createInMemoryArtifactStore({ clock: now });
  const derivedCoverageGrantee = "identity:studio-editor";
  const artifactFactory: ReturnType<typeof createInMemoryArtifactFactory> = {
    get createdArtifacts(): readonly StudioArtifactRef[] {
      return innerFactory.createdArtifacts;
    },
    contentOf(artifactId: string): Uint8Array | undefined {
      return innerFactory.contentOf(artifactId);
    },
    async createArtifact(input) {
      const result = await innerFactory.createArtifact(input);
      if (result.ok) {
        // Register the new version in the engines sandbox store so subsequent
        // pawn tasks can resolve it as a job input (scoped-artifacts-only).
        engineArtifactStore.registerArtifact(
          bridge<Parameters<typeof engineArtifactStore.registerArtifact>[0]>(result.artifact),
          input.content ?? new Uint8Array(0),
        );
        // DISCLOSED composition-seam behavior: record a REAL derived-work
        // grant (transform over the new version, derivationAllowed terms)
        // for the disclosed editing principal and refresh the gate's grant
        // view — chained pawn executions (final assembly over created
        // intermediates) then pass the REAL rights gate. A production
        // composition root provisions equivalent derived-work coverage
        // through the rights authority before scheduling chained transforms.
        const derivedGrant = rightsRepository.grantRights({
          scope: bridge<never>({ tenantId: String(input.tenantId) }),
          id: bridge<never>(`rights:studio-editing-derived:${String(result.artifact.artifactId)}`),
          grantee: bridge<never>(derivedCoverageGrantee),
          actions: ["use", "transform"] as never,
          subjectRefs: [bridge<never>(String(result.artifact.artifactId))],
          sourceRefs: (input.parents ?? []).length > 0
            ? input.parents.map((parent) => bridge<never>(String(parent.artifactId)))
            : [bridge<never>("consent:studio-editing-seam")],
          terms: {
            attributionRequired: true,
            commercialUseAllowed: false,
            derivationAllowed: true,
            notes: "derived-work coverage recorded at the disclosed editing composition seam",
          } as never,
        });
        if (derivedGrant !== null && "error" in derivedGrant) {
          throw new Error(`editing stack derived-work grant rejected: ${JSON.stringify(derivedGrant)}`);
        }
        rightsGate.registerGrantView(
          { tenantId: bridge<never>(String(input.tenantId)) },
          rightsRepository.listRightsGrants({ tenantId: bridge<never>(String(input.tenantId)) } as never),
        );
      }
      return result;
    },
  };

  // ---- Production's artifact-source seam over the studio factory ----
  const artifactSource: PawnArtifactSourcePort = {
    async resolve(scopeRef, ref) {
      const artifact = innerFactory.createdArtifacts.find(
        (entry) =>
          entry.artifactId === ref.artifactId && Number(entry.version) === Number(ref.version),
      );
      if (artifact === undefined) return null;
      if (String(artifact.tenantId) !== String(scopeRef.tenantId)) return null;
      return {
        artifactId: artifact.artifactId,
        version: artifact.version,
        tenantId: artifact.tenantId,
        type: artifact.type,
        digest: artifact.digest,
        rightsRef: artifact.rightsRef,
      };
    },
  };

  // ---- The REAL engines runner behind production's runner seam ----
  const engineRegistry = createInMemoryEngineRegistry({ clock: now });
  const jobEvents = createInMemoryJobEventSink();
  const engineRunner = createInMemoryEngineRunner({
    registry: engineRegistry,
    artifactStore: engineArtifactStore,
    eventSink: jobEvents,
    clock: now,
    now: () => 0,
  });
  engineRegistry.registerEngine(
    bridge<Parameters<typeof engineRegistry.registerEngine>[0]>(timelineRendererManifest()),
  );
  engineRunner.registerAdapter(
    createTestDoubleEngineAdapter({
      engineId: "engine:timeline-renderer" as EngineId,
      engineVersion: 1 as Version,
      modelIdentity: "checkpoint:test/timeline-renderer@1",
      cost: { amount: 0.02, currency: "USD" },
      failure: options.engineFailure,
    }),
  );

  // ---- The REAL agent-stack registries behind production's seams ----
  const bodyRegistry = createInMemoryAgentBodyRegistry();
  const modelRuntime = createInMemoryModelRuntime({
    models: [
      {
        modelRef: "mos-model:editing-seam-unused" as ModelRef,
        runtimeRef: "mos-runtime:editing-seam" as RuntimeRef,
        description: "Composition-seam catalog entry (never asked by the editing surface)",
      },
    ],
    defaultModelRef: "mos-model:editing-seam-unused" as ModelRef,
    now,
  });
  const instances = createInMemoryAgentInstanceRegistry({
    bodyRegistry,
    modelRuntime,
    instanceIdPrefix: "studio-editing-pawn",
  });
  const executor = createSubstrateInstanceExecutor(
    createInMemoryAgentRuntimeSubstrateDouble({ now }).port,
  );

  // ---- The editing transform definition (kind remix — the editor pawn serves it) ----
  const transformSource = createInMemoryTransformSource({
    definitions: [
      {
        id: EDITING_TRANSFORM_APPLICATION.definitionId,
        version: 1 as Version,
        kind: "remix",
        tenantId,
        inputTypes: ["audio", "video", "image", "text", "timeline"],
        outputTypes: ["audio", "video", "image", "text", "timeline"],
        parameters: { type: "object" },
        capabilityRequirements: [{ capabilityId: "render_timeline" as CapabilityId, version: 1 as Version }],
        evaluator: "evaluator:studio-editing" as EvaluatorRef,
        costModel: { basis: "per-invocation", amount: 0.05, currency: "USD" },
        latencyModel: { p50Ms: 1000, p95Ms: 4000, p99Ms: 10_000 },
        rightsRequirements: [],
        policyRequirements: [],
        lineageRules: [],
      },
    ],
  });

  // ---- Production's pawn execution runtime (the W7-B surfaces) ----
  let organizationSource: PawnOrganizationSource | undefined;
  const pawnRuntime = createInMemoryPawnExecutionRuntime({
    bodyRegistry,
    instances,
    executor,
    engineRunner,
    transformSource,
    artifactSource,
    rightsGate,
    organizationSource: {
      get: (scopeRef, organizationId, version) =>
        organizationSource?.get(scopeRef, organizationId, version),
    },
    now,
    executionIdFactory: createDeterministicIdFactory("pawn-exec") as () => PawnExecutionId,
    engineJobIdFactory: createDeterministicIdFactory("engine-job") as () => EngineJobId,
  });
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    pawnRuntime.execution.registerPawnBody(pawn);
  }
  const organizationRegistry = createInMemoryPawnOrganizationRegistry({
    listPawnBodies: pawnRuntime.execution.listPawnBodies,
  });
  organizationSource = {
    get: (scopeRef, organizationId, version) =>
      organizationRegistry.getPawnOrganization(scopeRef, organizationId, version),
  };
  organizationRegistry.registerPawnOrganization(bridge<never>(scope), {
    scope,
    organizationId: EDITING_ORGANIZATION_REF.id,
    nodes: [{ nodeId: "editor-node", pawnKind: "editor" }],
    evaluator: "evaluator:studio-editing-org" as EvaluatorRef,
  } as never);

  // ---- The studio editing runtime over the composed seams ----
  const editingRuntime = createEditingCompositionRuntime({
    pawnExecution: pawnRuntime.execution,
    artifactFactory,
    participantConsentPort,
    now,
    editingSessionIdFactory: createDeterministicIdFactory("edit-session") as () => EditingSessionId,
    packageIdFactory: createDeterministicIdFactory("edit-package") as () => StudioArtifactPackageId,
    graphIdFactory: createDeterministicIdFactory("edit-graph") as () => EditGraphId,
  });

  const createSourceArtifact = async (input: {
    readonly tenantId: TenantId;
    readonly type: StudioArtifactRef["type"];
    readonly stage: StudioArtifactRef["stage"];
    readonly content: string;
    readonly rightsRef?: string;
  }): Promise<StudioArtifactRef> => {
    const creation = await artifactFactory.createArtifact({
      tenantId: input.tenantId,
      type: input.type,
      stage: input.stage,
      creationMethod: "human-capture",
      storageRef: `storage:studio-editing/${input.content}` as StudioArtifactRef["storageRef"],
      content: new TextEncoder().encode(input.content),
      rightsRef: (input.rightsRef ?? EDITING_SOURCE_RIGHTS_REF) as RightsRef,
      provenanceRef: "provenance:studio-editing-source" as ProvenanceRef,
      parents: [],
    });
    if (!creation.ok) {
      throw new Error(`editing stack source artifact rejected: ${JSON.stringify(creation.error)}`);
    }
    return creation.artifact;
  };

  return {
    editing: editingRuntime,
    tenantId,
    pawnExecution: pawnRuntime.execution,
    artifactFactory,
    jobEvents,
    engineArtifactStore,
    transformSource,
    rightsRepository,
    now,
    grantTransformRights,
    createSourceArtifact,
    buildSourcePackage: (input) => buildEditingSourcePackage(input, now),
  };
}

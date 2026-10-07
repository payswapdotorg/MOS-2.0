/**
 * REAL-stack integration test (LAB-013) — the RUNTIME half of the
 * compatibility pins.
 *
 * Runs WHOLE PAWN LIFECYCLES through the REAL sibling packages wired behind
 * this package's mirrored seams (the compile-time half lives in
 * compat/agent-stack-compat.ts / engine-runner-compat.ts /
 * transform-source-compat.ts):
 *
 * - REAL `@mos/agents` in-memory body registry behind the body-registry
 *   seam (the ten pawn bodies' canonical AgentBody records register there);
 * - REAL `@mos/agent-runtime` in-memory model runtime (THE single boundary)
 *   + instance registry + substrate instance executor over the real
 *   package's own disclosed in-memory substrate double, behind the
 *   instance-registry / executor seams;
 * - REAL `@mos/engines` in-memory runner (registry + artifact store + job
 *   event sink + the disclosed test-double engine adapter) behind the
 *   runner seam — EngineJobs really flow through the policy-faithful
 *   sandbox, and a configured typed adapter failure passes through VERBATIM
 *   into the pawn execution record;
 * - REAL `@mos/lab` transform-definition registry behind the transform
 *   source seam via the ONE-LINE DELEGATION (`resolve` →
 *   `getTransformDefinition`);
 * - REAL `@mos/rights` repository + `evaluateRights` rule behind the rights
 *   gate, and the REAL `@mos/content` artifact repository behind the
 *   artifact-source seam.
 *
 * The engine/agent identities are FICTIONAL-BUT-PLAUSIBLE citations (the
 * same discipline as the pawn bodies' tool refs): the compat test registers
 * matching engine manifests + the disclosed double adapter so the REAL
 * runner actually executes them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ArtifactRef, TenantScope } from "@mos/contracts";

// REAL sibling packages (relative dist paths — the same public surfaces the
// bare specifiers resolve to after `tsc -b`; no runtime dependency of this
// package is created).
import {
  createInMemoryAgentBodyRegistry,
} from "../../mos-agents/dist/index.js";
import {
  createInMemoryAgentInstanceRegistry,
  createInMemoryModelRuntime,
  createSubstrateInstanceExecutor,
  createInMemoryAgentRuntimeSubstrateDouble,
} from "../../mos-agent-runtime/dist/index.js";
import {
  createInMemoryEngineRegistry,
  createInMemoryEngineRunner,
  createInMemoryArtifactStore,
  createInMemoryJobEventSink,
  createTestDoubleEngineAdapter,
} from "../../mos-engines/dist/index.js";
import {
  createInMemoryTransformDefinitionRegistry,
} from "../../mos-lab/dist/index.js";
import { createInMemoryRightsRepository, evaluateRights } from "../../mos-rights/dist/index.js";
import { createInMemoryArtifactRepository } from "../../mos-content/dist/index.js";

// THIS package's public surface (built).
import {
  TRANSFORM_PAWN_BODIES,
  createInMemoryPawnExecutionRuntime,
  createInMemoryPawnRightsGate,
} from "../dist/index.js";

const NOW = (): string => "2026-01-01T00:00:00.000Z";
const SCOPE = { tenantId: "tenant:compat" as never };
const PRINCIPAL = "identity:compat-producer";
const ACTOR = { kind: "identity", principalId: PRINCIPAL } as const;

const MODEL_REF = "mos-model:compat-default" as never;
const RUNTIME_REF = "mos-runtime:compat-substrate" as never;

/** Input artifact refs (registered in BOTH the content and engine stores). */
function makeArtifactRef(seed: string, type: "video" | "audio"): ArtifactRef {
  const hex = Array.from({ length: 64 }, (_, index) =>
    ((seed.charCodeAt(index % seed.length) + index) % 16).toString(16),
  ).join("");
  return {
    artifactId: `artifact:compat-${seed}` as ArtifactRef["artifactId"],
    version: 1 as ArtifactRef["version"],
    tenantId: SCOPE.tenantId,
    digest: `sha256:${hex}` as ArtifactRef["digest"],
    type: type as ArtifactRef["type"],
    storageRef: `storage://compat/${seed}` as ArtifactRef["storageRef"],
    rightsRef: "rights:compat-grant" as ArtifactRef["rightsRef"],
    provenanceRef: `provenance:compat/${seed}` as ArtifactRef["provenanceRef"],
  };
}

const SOURCE_VIDEO: ArtifactRef = makeArtifactRef("source-video", "video");
const SOURCE_AUDIO: ArtifactRef = makeArtifactRef("source-audio", "audio");

/** A complete Engine manifest for a fictional-but-plausible engine. */
function makeManifest(id: string, capabilityId: string): Record<string, unknown> {
  return {
    id: id as never,
    version: 1 as never,
    capabilityIds: [capabilityId as never],
    adapterRef: `adapter:${id}@1` as never,
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
      databaseCredentials: "none",
      providerCredentials: "none",
    },
    provenance: `provenance:engine:${id}@1` as never,
    benchmark: {
      id: `benchmark:${id}@1` as never,
      capabilityVersion: 1 as never,
      engineVersion: 1 as never,
      benchmarkCorpusRef: "corpus:compat@1" as never,
      evaluatorVersion: 1 as never,
      metrics: { score: 0.8 },
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

/** A lab transform-definition registration input. */
function makeDefinitionInput(
  id: string,
  kind: string,
  capabilityIds: readonly string[],
  inputType: "video" | "audio",
): Record<string, unknown> {
  return {
    scope: SCOPE,
    id: id as never,
    kind: kind as never,
    inputConstraint: {
      name: "compat-input",
      acceptedTypes: [inputType],
      acceptedModalities: [inputType],
      minInputs: 1,
      maxInputs: 4,
      requiresRights: true,
    },
    outputContract: { outputTypes: [inputType], outputCount: 1 },
    parameters: { type: "object" },
    capabilityRequirements: capabilityIds.map((capabilityId) => ({
      capabilityId: capabilityId as never,
      version: 1 as never,
    })),
    humanParticipation: false,
    evaluator: `evaluator:transform/${id}` as never,
    costModel: { basis: "per-invocation", amount: 0.1, currency: "USD" },
    latencyModel: { p50Ms: 1000, p95Ms: 4000, p99Ms: 10_000 },
    rightsRequirements: [],
    policyRequirements: [],
    lineageRules: [],
  };
}

/** Composes the REAL stack behind this package's seams. */
async function composeRealStack(): Promise<{
  readonly execution: ReturnType<typeof createInMemoryPawnExecutionRuntime>["execution"];
  readonly bodies: ReturnType<typeof createInMemoryAgentBodyRegistry>;
  readonly jobEvents: ReturnType<typeof createInMemoryJobEventSink>;
  readonly labRegistry: ReturnType<typeof createInMemoryTransformDefinitionRegistry>;
}> {
  // REAL rights authority + evaluation rule.
  const rights = createInMemoryRightsRepository({ now: NOW });
  const grant = rights.grantRights({
    scope: SCOPE,
    id: "rights:compat-grant" as never,
    grantee: PRINCIPAL as never,
    actions: ["use", "transform"],
    subjectRefs: [
      "artifact:compat-source-video",
      "artifact:compat-source-audio",
    ],
    sourceRefs: ["consent:compat-producer"],
    terms: {
      attributionRequired: true,
      commercialUseAllowed: false,
      derivationAllowed: false,
      notes: null,
    },
  });
  if (grant !== null && "error" in grant) {
    throw new Error(`compat grant failed: ${JSON.stringify(grant)}`);
  }
  const rightsGate = createInMemoryPawnRightsGate({
    evaluate: evaluateRights as never,
    now: NOW,
  });
  rightsGate.registerGrantView(SCOPE, rights.listRightsGrants(SCOPE));

  // REAL content authority behind the artifact-source seam.
  const content = createInMemoryArtifactRepository({
    rights: { getRights: (ref: unknown) => rights.getRights(ref as never) },
    now: NOW,
  });
  for (const [ref, type] of [
    [SOURCE_VIDEO, "video"],
    [SOURCE_AUDIO, "audio"],
  ] as const) {
    const registered = content.registerArtifact({
      scope: SCOPE,
      artifact: {
        id: ref.artifactId,
        type: type as never,
        digest: ref.digest,
        storageRef: ref.storageRef,
        provenanceRef: ref.provenanceRef,
        rightsRef: ref.rightsRef,
        lineage: [],
        creationMethod: "reference",
      },
    });
    if (registered === null || "error" in registered) {
      throw new Error(`compat artifact registration failed: ${JSON.stringify(registered)}`);
    }
  }
  const artifactSource = {
    async resolve(scope: TenantScope, ref: ArtifactRef) {
      const artifact = content.getArtifact(
        scope as never,
        ref.artifactId as never,
        ref.version as number,
      );
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

  // REAL agents + agent-runtime behind the agent-stack seams.
  const bodies = createInMemoryAgentBodyRegistry();
  const modelRuntime = createInMemoryModelRuntime({
    models: [{ modelRef: MODEL_REF, runtimeRef: RUNTIME_REF }],
    defaultModelRef: MODEL_REF,
    now: NOW as never,
  });
  const instances = createInMemoryAgentInstanceRegistry({
    bodyRegistry: bodies,
    modelRuntime,
  });
  const executor = createSubstrateInstanceExecutor(
    createInMemoryAgentRuntimeSubstrateDouble({ now: NOW as never }).port,
  );

  // REAL engines runner behind the runner seam.
  const engineRegistry = createInMemoryEngineRegistry({ clock: NOW as never });
  const artifactStore = createInMemoryArtifactStore({ clock: NOW as never });
  const jobEvents = createInMemoryJobEventSink();
  artifactStore.registerArtifact(SOURCE_VIDEO as never, new Uint8Array([1, 2, 3]));
  artifactStore.registerArtifact(SOURCE_AUDIO as never, new Uint8Array([4, 5, 6]));
  engineRegistry.registerEngine(makeManifest("engine:clip-ranker", "rank_clip_candidates") as never);
  engineRegistry.registerEngine(makeManifest("engine:transcriber", "transcribe_audio") as never);
  const engineRunner = createInMemoryEngineRunner({
    registry: engineRegistry,
    artifactStore,
    eventSink: jobEvents,
    clock: NOW as never,
    now: () => 0,
  });
  engineRunner.registerAdapter(
    createTestDoubleEngineAdapter({
      engineId: "engine:clip-ranker" as never,
      engineVersion: 1 as never,
      modelIdentity: "checkpoint:test/clip-ranker@1",
      cost: { amount: 0.02, currency: "USD" },
    }),
  );
  engineRunner.registerAdapter(
    createTestDoubleEngineAdapter({
      engineId: "engine:transcriber" as never,
      engineVersion: 1 as never,
      modelIdentity: "checkpoint:test/transcriber@1",
      failure: {
        code: "engine-adapter-crashed",
        message: "the disclosed double adapter was configured to fail",
        retriable: true,
      },
    }),
  );

  // REAL lab transform registry behind the transform-source seam (the
  // ONE-LINE DELEGATION).
  const labRegistry = createInMemoryTransformDefinitionRegistry({ now: NOW as never });
  for (const input of [
    makeDefinitionInput("transform:compat-clips", "clip", ["rank_clip_candidates"], "video"),
    makeDefinitionInput("transform:compat-podcast", "podcast", ["generate_questions"], "audio"),
    makeDefinitionInput("transform:compat-questions", "podcast", ["transcribe_audio", "generate_questions"], "audio"),
  ]) {
    const registered = await labRegistry.registerTransformDefinition(input as never);
    if (registered !== null && "error" in registered) {
      throw new Error(`compat definition registration failed: ${JSON.stringify(registered)}`);
    }
  }
  const transformSource = {
    resolve: (scope: TenantScope, id: Parameters<typeof labRegistry.getTransformDefinition>[1], version?: number) =>
      labRegistry.getTransformDefinition(scope as never, id, version),
  };

  // The pawn execution runtime over the REAL seams.
  const runtime = createInMemoryPawnExecutionRuntime({
    bodyRegistry: bodies,
    instances,
    executor,
    engineRunner,
    transformSource,
    artifactSource,
    rightsGate,
    now: NOW as never,
  });
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    runtime.execution.registerPawnBody(pawn);
  }
  return { execution: runtime.execution, bodies, jobEvents, labRegistry };
}

test("the ten pawn bodies register through the REAL agents body registry", async () => {
  const stack = await composeRealStack();
  assert.equal(stack.execution.listPawnBodies().length, 10);
  // The canonical AgentBody records are resolvable through the REAL registry.
  const body = stack.bodies.get("pawn:clip-selection" as never, 1 as never);
  assert.ok(body !== undefined);
  assert.deepEqual([...body.capabilities], ["rank_clip_candidates"]);
  assert.deepEqual(
    [...body.tools],
    ["engine-tool:engine:clip-ranker@1:rank_clip_candidates@1"],
  );
  assert.deepEqual(stack.bodies.listVersions("pawn:quality-critic" as never), [1 as never]);
});

test("a deterministic pawn executes through the REAL engine runner end-to-end", async () => {
  const stack = await composeRealStack();
  const instance = stack.execution.instantiatePawn(SCOPE, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(SCOPE, {
    instanceId: instance.instanceId,
    transformApplication: { definitionId: "transform:compat-clips" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_VIDEO],
    parameters: { clipCount: 2 },
    seed: 42,
    actor: ACTOR,
    engineResourceLimits: { cpuCores: 2, gpuUnits: 1, memoryMb: 512, timeoutMs: 120_000 },
  });

  assert.equal(record.lifecycle, "succeeded");
  assert.equal(record.failure, null);
  assert.equal(record.modelBinding, null);
  // The REAL lab registry resolved the definition (kind + derived fields).
  assert.equal(record.transformKind, "clip");
  assert.equal(record.transformDefinitionId, "transform:compat-clips");
  // The REAL runner executed the job: the double adapter echoes the input
  // refs as outputs, with real provenance/cost/duration.
  assert.equal(record.engineInvocations.length, 1);
  const invocation = record.engineInvocations[0];
  assert.ok(invocation !== undefined);
  assert.equal(invocation.lifecycle, "succeeded");
  assert.equal(invocation.jobId, "engine-job-1");
  assert.equal(invocation.engineId, "engine:clip-ranker");
  assert.deepEqual(invocation.outputArtifactRefs, [SOURCE_VIDEO]);
  assert.equal(invocation.provenance?.modelIdentity, "checkpoint:test/clip-ranker@1");
  assert.deepEqual(invocation.cost, { amount: 0.02, currency: "USD" });
  // The REAL job event sink recorded the §30 lifecycle.
  assert.ok(stack.jobEvents.events.length >= 2);
  // §30 record fields are complete over the REAL stack too.
  assert.equal(record.contractVersion, "pawn-execution/1");
  assert.equal(record.rights.verdict, "granted");
  // The REAL double adapter's metrics vocabulary, carried on the record.
  assert.equal(record.evaluation.engineMetrics.invocations, 1);
  assert.equal(record.evaluation.engineMetrics.inputArtifactCount, 1);
});

test("an llm-flavored pawn binds through the REAL model boundary and executes through the REAL executor", async () => {
  const stack = await composeRealStack();
  const instance = stack.execution.instantiatePawn(SCOPE, { pawnKind: "podcast-interviewer" });
  const bound = stack.execution.bindPawnModel(SCOPE, instance.instanceId);
  assert.equal(bound.lifecycle, "bound");
  assert.equal(bound.modelRef, MODEL_REF);
  assert.equal(bound.runtimeRef, RUNTIME_REF);
  // The REAL instance registry assigned the binding (real instance id shape).
  assert.ok((bound.instanceId as string).length > 0);

  const record = await stack.execution.executePawn(SCOPE, {
    instanceId: instance.instanceId,
    transformApplication: { definitionId: "transform:compat-podcast" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_AUDIO],
    parameters: { questionCount: 4 },
    seed: null,
    actor: ACTOR,
  });
  assert.equal(record.lifecycle, "succeeded");
  assert.ok(record.modelBinding !== null);
  assert.equal(record.modelBinding.modelRef, MODEL_REF);
  // The agent execution went through the REAL substrate executor over the
  // real substrate double (echo delivery of the JSON input).
  assert.ok(record.agentExecution !== null);
  assert.equal(record.agentExecution.finishReason, "completed");
  assert.ok((record.agentExecution.output as string).startsWith("json:"));
  assert.ok(record.agentExecution.events.length > 0);
  assert.deepEqual(record.engineInvocations, []);
});

test("a typed adapter failure from the REAL runner passes through VERBATIM into the record", async () => {
  const stack = await composeRealStack();
  const instance = stack.execution.instantiatePawn(SCOPE, { pawnKind: "question-designer" });
  stack.execution.bindPawnModel(SCOPE, instance.instanceId);
  const record = await stack.execution.executePawn(SCOPE, {
    instanceId: instance.instanceId,
    transformApplication: { definitionId: "transform:compat-questions" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_AUDIO],
    parameters: { questionCount: 4 },
    seed: 9,
    actor: ACTOR,
    engineResourceLimits: { cpuCores: 2, gpuUnits: 1, memoryMb: 512, timeoutMs: 120_000 },
  });

  assert.equal(record.lifecycle, "failed");
  assert.ok(record.failure !== null);
  assert.equal(record.failure.code, "engine-invocation-failed");
  assert.equal(record.failure.detail, "engine-adapter-crashed");
  assert.equal(record.failure.retriable, true);
  const invocation = record.engineInvocations[0];
  assert.ok(invocation !== undefined);
  assert.equal(invocation.capabilityId, "transcribe_audio");
  assert.ok(invocation.failure !== null);
  assert.equal(invocation.failure.code, "engine-adapter-crashed");
  assert.equal(invocation.failure.retriable, true);
  // The agent phase never ran (the engine failure is terminal for the task).
  assert.equal(record.agentExecution, null);
  // The REAL sink recorded the failed job lifecycle.
  assert.ok(stack.jobEvents.events.some((event) => "jobId" in event));
});

test("tenant scoping holds over the REAL stack (no existence leaks)", async () => {
  const stack = await composeRealStack();
  const instance = stack.execution.instantiatePawn(SCOPE, { pawnKind: "clip-selection" });
  assert.equal(
    stack.execution.getPawnInstance({ tenantId: "tenant:other" as never }, instance.instanceId),
    undefined,
  );
  const foreign = await stack.execution
    .executePawn({ tenantId: "tenant:other" as never }, {
      instanceId: instance.instanceId,
      transformApplication: { definitionId: "transform:compat-clips" as never, definitionVersion: 1 as never },
      inputArtifactRefs: [SOURCE_VIDEO],
      parameters: {},
      seed: 1,
      actor: ACTOR,
      engineResourceLimits: { cpuCores: 2, gpuUnits: 1, memoryMb: 512, timeoutMs: 120_000 },
    })
    .then(
      () => "executed",
      (error: unknown) => (error instanceof Error ? error.message.split("]")[0] : "other"),
    );
  assert.equal(foreign, "[unknown-pawn-instance");
});

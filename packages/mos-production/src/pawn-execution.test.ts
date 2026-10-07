/**
 * Pawn execution round-trips (LAB-013) through the disclosed doubles:
 * deterministic pawns (engine invocations THROUGH the runner seam, no model
 * binding — pinned on the record), llm-flavored pawns (bound through the
 * single boundary, agent execution through the executor seam), the
 * composite question-designer path (engine + agent in ONE execution),
 * typed engine failures passing through verbatim, the rights gate
 * PRECEDING every invocation, §30 record completeness, append-only
 * immutable history and tenant scoping with no existence leaks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PawnExecutionError } from "./domain/errors.js";
import type { PawnInstanceExecutorPort } from "./ports/agent-stack.ports.js";
import {
  ACTOR_PRODUCER,
  BETA_VIDEO_REF,
  REACTION_CAPTURE_REF,
  SCOPE_ALPHA,
  SCOPE_BETA,
  SOURCE_AUDIO_REF,
  SOURCE_VIDEO_REF,
  composePawnStack,
} from "./testing/compose-pawn-stack.js";
import type { ComposePawnStackOptions } from "./testing/compose-pawn-stack.js";
import type { TransformPawnTask } from "./contracts/pawn-task.js";
import type { PawnEngineJobSubmissionOptions } from "./ports/engine-runner.port.js";
import type { ResourceLimits } from "@mos/contracts";

const ENGINE_LIMITS: ResourceLimits = {
  cpuCores: 2,
  gpuUnits: 0,
  memoryMb: 512,
  timeoutMs: 120_000,
};

function clipTask(overrides: Partial<TransformPawnTask> = {}): TransformPawnTask {
  return {
    instanceId: "" as never,
    transformApplication: { definitionId: "transform:clip-highlights" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_VIDEO_REF],
    parameters: { clipCount: 3 },
    seed: 7,
    actor: ACTOR_PRODUCER,
    engineResourceLimits: ENGINE_LIMITS,
    ...overrides,
  };
}

function podcastTask(overrides: Partial<TransformPawnTask> = {}): TransformPawnTask {
  return {
    instanceId: "" as never,
    transformApplication: { definitionId: "transform:podcast-episode" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_AUDIO_REF],
    parameters: { questionCount: 5 },
    seed: 11,
    actor: ACTOR_PRODUCER,
    ...overrides,
  };
}

function questionPackTask(overrides: Partial<TransformPawnTask> = {}): TransformPawnTask {
  return {
    instanceId: "" as never,
    transformApplication: { definitionId: "transform:question-pack" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_AUDIO_REF],
    parameters: { questionCount: 5 },
    seed: 13,
    actor: ACTOR_PRODUCER,
    engineResourceLimits: ENGINE_LIMITS,
    ...overrides,
  };
}

test("deterministic pawn round trip: engine invocation through the runner seam, NO model binding", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(SCOPE_ALPHA, clipTask({ instanceId: instance.instanceId }));

  assert.equal(record.lifecycle, "succeeded");
  assert.equal(record.failure, null);
  assert.equal(record.pawnKind, "clip-selection");
  assert.equal(record.instanceId, instance.instanceId);
  assert.equal(record.bodyId, "pawn:clip-selection");
  assert.equal(record.bodyVersion, 1);
  // §9 PIN: a deterministic pawn carries NO model binding on the record.
  assert.equal(record.modelBinding, null);
  assert.equal(record.agentExecution, null);
  assert.equal(record.transformKind, "clip");

  // The engine invocation went THROUGH the runner seam (the double's
  // inspection surface records every submission).
  assert.equal(stack.doubles.engineRunner.submissions.length, 1);
  const submission = stack.doubles.engineRunner.submissions[0];
  assert.ok(submission !== undefined);
  assert.equal(submission.job.capabilityId, "rank_clip_candidates");
  assert.equal(submission.job.engineId, "engine:clip-ranker");
  assert.equal(submission.job.engineVersion, 1);
  assert.equal(submission.job.capabilityVersion, 1);
  assert.deepEqual(submission.job.inputArtifactRefs, [SOURCE_VIDEO_REF]);
  assert.deepEqual(submission.job.parameters, { clipCount: 3 });
  assert.equal(submission.job.seed, 7);
  assert.deepEqual(submission.job.resourceLimits, ENGINE_LIMITS);
  assert.deepEqual(submission.job.outputContract, { type: "object" });

  // The invocation is recorded as an EngineJob ref with full identity.
  assert.equal(record.engineInvocations.length, 1);
  const invocation = record.engineInvocations[0];
  assert.ok(invocation !== undefined);
  assert.equal(invocation.lifecycle, "succeeded");
  assert.equal(invocation.failure, null);
  assert.equal(invocation.jobId, submission.job.id);
  assert.equal(invocation.capabilityId, "rank_clip_candidates");
  assert.equal(invocation.engineId, "engine:clip-ranker");
  assert.equal(invocation.outputArtifactRefs.length, 1);
  assert.equal(invocation.provenance?.engineId, "engine:clip-ranker");
  assert.ok((invocation.cost?.amount ?? 0) >= 0);

  // Engine outputs are the execution outputs (deterministic pawn).
  assert.deepEqual(record.outputArtifactRefs, invocation.outputArtifactRefs);
  // The rights gate granted the transform action for the fixture grant.
  assert.equal(record.rights.verdict, "granted");
  assert.equal(record.rights.subjectsEvaluated, 1);
  assert.ok(record.rights.grantRef !== null);
  // Audit trace: chronological phase events.
  const types = record.auditTrace.map((event) => event.type);
  assert.deepEqual(types, [
    "execution-started",
    "rights-evaluated",
    "engine-job-submitted",
    "engine-job-completed",
    "execution-completed",
  ]);
});

test("§30 completeness: every observability field is explicit on the record", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(SCOPE_ALPHA, clipTask({ instanceId: instance.instanceId }));

  // request/run id + contract version
  assert.ok((record.executionId as string).length > 0);
  assert.equal(record.contractVersion, "pawn-execution/1");
  // actor
  assert.deepEqual(record.actor, ACTOR_PRODUCER);
  // session id (the executing agent instance) + body version
  assert.equal(record.instanceId, instance.instanceId);
  assert.equal(record.bodyVersion, 1);
  // organization version (null = standalone)
  assert.equal(record.organization, null);
  // engine version + capability version (on the invocation records)
  const invocation = record.engineInvocations[0];
  assert.ok(invocation !== undefined);
  assert.equal(invocation.engineVersion, 1);
  assert.equal(invocation.capabilityVersion, 1);
  // artifact refs
  assert.deepEqual(record.inputArtifactRefs, [SOURCE_VIDEO_REF]);
  assert.ok(record.outputArtifactRefs.length === 1);
  // cost/latency
  assert.ok(record.cost.currency.length > 0);
  assert.ok(record.durationMs >= 0);
  assert.ok(invocation.durationMs >= 0);
  // failure/warning
  assert.equal(record.failure, null);
  assert.deepEqual(record.warnings, []);
  // provenance (per engine invocation)
  assert.ok(invocation.provenance !== null);
  // evaluation result
  assert.equal(record.evaluation.evaluator, "evaluator:pawn/clip-selection");
  assert.ok(record.evaluation.engineMetrics.qualityScore !== undefined);
  // transform/engine versions context
  assert.equal(record.transformDefinitionId, "transform:clip-highlights");
  assert.equal(record.transformDefinitionVersion, 1);
  assert.deepEqual(record.parameters, { clipCount: 3 });
  assert.equal(record.seed, 7);
  assert.ok(record.startedAt.length > 0 && record.completedAt.length > 0);
});

test("typed engine failures pass through VERBATIM and are recorded, never thrown", async () => {
  const options: ComposePawnStackOptions = {
    engineRoutes: {
      rank_clip_candidates: {
        capabilityId: "rank_clip_candidates",
        failure: { code: "quota-exceeded", message: "cpu quota exceeded in sandbox", retriable: true },
        warnings: [{ code: "partial-output", message: "outputs discarded on failure" }],
      },
    },
  };
  const stack = composePawnStack(options);
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(SCOPE_ALPHA, clipTask({ instanceId: instance.instanceId }));

  assert.equal(record.lifecycle, "failed");
  assert.ok(record.failure !== null);
  assert.equal(record.failure.code, "engine-invocation-failed");
  assert.equal(record.failure.detail, "quota-exceeded");
  assert.equal(record.failure.retriable, true);
  assert.ok(record.failure.message.includes("quota-exceeded"));
  // The runner's typed vocabulary passes through VERBATIM on the invocation.
  const invocation = record.engineInvocations[0];
  assert.ok(invocation !== undefined);
  assert.equal(invocation.lifecycle, "failed");
  assert.ok(invocation.failure !== null);
  assert.equal(invocation.failure.code, "quota-exceeded");
  assert.equal(invocation.failure.message, "cpu quota exceeded in sandbox");
  assert.equal(invocation.failure.retriable, true);
  assert.deepEqual(invocation.outputArtifactRefs, []);
  // The invocation's warnings are recorded on the execution.
  assert.ok(record.warnings.some((warning) => warning.code === "partial-output"));
  // The submission itself went through the seam.
  assert.equal(stack.doubles.engineRunner.submissions.length, 1);
  // A failed execution is still a recorded production action.
  assert.equal(stack.execution.listPawnExecutions(SCOPE_ALPHA).length, 1);
});

test("the rights gate PRECEDES every engine/agent invocation (pinned)", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({
      instanceId: instance.instanceId,
      actor: { kind: "identity", principalId: "identity:someone-without-grants" },
    }),
  );

  assert.equal(record.lifecycle, "failed");
  assert.ok(record.failure !== null);
  assert.equal(record.failure.code, "rights-denied");
  // The REAL evaluateRights denial reason, verbatim.
  assert.equal(record.rights.verdict, "denied");
  assert.equal(record.rights.denialReason, "grantee-not-covered");
  assert.equal(record.rights.grantRef, null);
  // ZERO engine submissions happened — the gate precedes them.
  assert.equal(stack.doubles.engineRunner.submissions.length, 0);
  assert.deepEqual(record.engineInvocations, []);
  assert.equal(record.agentExecution, null);
  assert.equal(record.failure.retriable, false);
  const types = record.auditTrace.map((event) => event.type);
  assert.deepEqual(types, ["execution-started", "rights-evaluated", "execution-failed"]);
});

test("an unbound llm-flavored instance is a RECORDED failure (bind through the boundary first)", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "podcast-interviewer" });
  const record = await stack.execution.executePawn(SCOPE_ALPHA, podcastTask({ instanceId: instance.instanceId }));

  assert.equal(record.lifecycle, "failed");
  assert.ok(record.failure !== null);
  assert.equal(record.failure.code, "pawn-instance-not-bound");
  assert.equal(record.failure.detail, "instantiated");
  assert.equal(record.modelBinding, null);
  assert.equal(record.agentExecution, null);
  assert.equal(stack.doubles.engineRunner.submissions.length, 0);
});

test("llm-flavored pawn round trip: model through THE single boundary, agent execution through the executor seam", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "podcast-interviewer" });
  const bound = stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId);
  assert.equal(bound.lifecycle, "bound");

  const record = await stack.execution.executePawn(SCOPE_ALPHA, podcastTask({ instanceId: instance.instanceId }));
  assert.equal(record.lifecycle, "succeeded");
  assert.equal(record.failure, null);
  // The model binding provenance comes from the boundary decision.
  assert.ok(record.modelBinding !== null);
  assert.equal(record.modelBinding.modelRef, "mos-model:pawn-default");
  assert.equal(record.modelBinding.runtimeRef, "mos-runtime:in-memory-agent");
  // Agent execution through the executor seam (substrate-shaped record).
  assert.ok(record.agentExecution !== null);
  assert.equal(record.agentExecution.finishReason, "completed");
  assert.ok(record.agentExecution.output.length > 0);
  assert.ok(record.agentExecution.events.length > 0);
  assert.ok(record.agentExecution.usage.steps !== undefined);
  // Pure-agent pawn: no engine invocations, no engine quota needed.
  assert.deepEqual(record.engineInvocations, []);
  assert.deepEqual(record.outputArtifactRefs, []);
  assert.equal(record.evaluation.engineMetrics.qualityScore, undefined);
  const types = record.auditTrace.map((event) => event.type);
  assert.deepEqual(types, [
    "execution-started",
    "rights-evaluated",
    "agent-execution-started",
    "agent-execution-completed",
    "execution-completed",
  ]);
});

test("the composite path: question-designer runs an engine job AND an agent execution in ONE record", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "question-designer" });
  stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId);
  const record = await stack.execution.executePawn(
    SCOPE_ALPHA,
    questionPackTask({ instanceId: instance.instanceId }),
  );

  assert.equal(record.lifecycle, "succeeded");
  // The transcribe_audio engine tool matched the transform requirement.
  assert.equal(record.engineInvocations.length, 1);
  assert.equal(record.engineInvocations[0]?.capabilityId, "transcribe_audio");
  assert.equal(stack.doubles.engineRunner.submissions.length, 1);
  // AND the agent execution ran on top of the engine output.
  assert.ok(record.agentExecution !== null);
  assert.equal(record.agentExecution.finishReason, "completed");
  // The executor input cites both the input artifacts and the engine output
  // (observable through the substrate-shaped agent-execution events).
  assert.ok(stack.doubles.executor !== undefined);
  assert.ok(record.modelBinding !== null);
  // Engine outputs + agent execution coexist on the record.
  assert.equal(record.outputArtifactRefs.length, 1);
  assert.equal(record.evaluation.engineMetrics.qualityScore, 0.9);
});

test("a non-completed agent finish reason is a recorded failure with the reason as detail", async () => {
  // Drive the failure through a directly-wired executor that finishes
  // 'budget-exhausted' (the composed double always completes).
  const failingExecutor: PawnInstanceExecutorPort = {
    async execute() {
      return {
        output: "partial",
        finishReason: "budget-exhausted" as const,
        events: [
          { type: "execution.started", occurredAt: "2026-01-01T00:00:00.000Z" },
          {
            type: "execution.completed",
            occurredAt: "2026-01-01T00:00:00.000Z",
            finishReason: "budget-exhausted" as const,
          },
        ],
        usage: { steps: 2 },
      };
    },
  };
  const stack = composePawnStack({ executorOverride: failingExecutor });
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "podcast-interviewer" });
  stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId);
  const record = await stack.execution.executePawn(
    SCOPE_ALPHA,
    podcastTask({ instanceId: instance.instanceId }),
  );
  assert.equal(record.lifecycle, "failed");
  assert.ok(record.failure !== null);
  assert.equal(record.failure.code, "agent-execution-failed");
  assert.equal(record.failure.detail, "budget-exhausted");
  assert.equal(record.failure.retriable, true);
  assert.ok(record.agentExecution !== null);
  assert.equal(record.agentExecution.finishReason, "budget-exhausted");
});

test("caller errors are thrown typed and append NO execution record", async () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const task = clipTask({ instanceId: instance.instanceId });
  const historySize = () => stack.execution.listPawnExecutions(SCOPE_ALPHA).length;

  const expectThrow = async (code: string, taskInput: TransformPawnTask): Promise<void> => {
    await assert.rejects(
      () => stack.execution.executePawn(SCOPE_ALPHA, taskInput),
      (error: unknown) => error instanceof PawnExecutionError && error.code === code,
    );
    assert.equal(historySize(), 0, `${code} must not append an execution record`);
  };

  await expectThrow("transform-application-unresolved", {
    ...task,
    transformApplication: { definitionId: "transform:unknown" as never, definitionVersion: 1 as never },
  });
  await expectThrow(
    "transform-kind-not-served",
    clipTask({
      instanceId: instance.instanceId,
      transformApplication: { definitionId: "transform:reaction-pip" as never, definitionVersion: 1 as never },
      inputArtifactRefs: [REACTION_CAPTURE_REF],
    }),
  );
  await expectThrow(
    "input-artifact-unresolved",
    clipTask({ instanceId: instance.instanceId, inputArtifactRefs: [BETA_VIDEO_REF] }),
  );
  await expectThrow(
    "artifact-digest-mismatch",
    clipTask({
      instanceId: instance.instanceId,
      inputArtifactRefs: [
        {
          ...SOURCE_VIDEO_REF,
          digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" as never,
        },
      ],
    }),
  );
  await expectThrow(
    "transform-input-type-not-declared",
    clipTask({ instanceId: instance.instanceId, inputArtifactRefs: [SOURCE_AUDIO_REF] }),
  );
  await expectThrow(
    "engine-resource-limits-required",
    clipTask({ instanceId: instance.instanceId, engineResourceLimits: undefined }),
  );
  await expectThrow("unknown-pawn-instance", clipTask({ instanceId: "pawn-instance-999" }));
  await expectThrow(
    "invalid-task",
    clipTask({ instanceId: instance.instanceId, seed: Number.NaN }),
  );
  const released = stack.execution.releasePawn(SCOPE_ALPHA, instance.instanceId);
  assert.equal(released.lifecycle, "released");
  await expectThrow("pawn-instance-released", clipTask({ instanceId: instance.instanceId }));
});

test("executions are append-only, immutable and tenant-scoped", async () => {
  const stack = composePawnStack();
  const clip = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const caption = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "caption" });

  const first = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({ instanceId: clip.instanceId }),
  );
  const second = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({
      instanceId: caption.instanceId,
      transformApplication: { definitionId: "transform:podcast-episode" as never, definitionVersion: 1 as never },
      inputArtifactRefs: [SOURCE_AUDIO_REF],
    }),
  );
  const third = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({
      instanceId: clip.instanceId,
      actor: { kind: "identity", principalId: "identity:no-grants" },
    }),
  );

  // Append-only order, failures included (a failure is data, not an absence).
  const history = stack.execution.listPawnExecutions(SCOPE_ALPHA);
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((record) => record.executionId),
    [first.executionId, second.executionId, third.executionId],
  );
  assert.equal(history[2]?.lifecycle, "failed");

  // Records are DEEP-frozen: nested mutation attempts throw.
  assert.throws(() => {
    (first.parameters as { clipCount: number }).clipCount = 99;
  }, TypeError);
  const invocation = first.engineInvocations[0];
  assert.ok(invocation !== undefined);
  assert.throws(() => {
    (invocation.metrics as Record<string, number>).qualityScore = 0;
  }, TypeError);
  assert.throws(() => {
    (first.auditTrace as unknown as { push: (x: unknown) => number }).push({
      type: "execution-completed",
      occurredAt: "2026-01-01T00:00:00.000Z",
      detail: "smuggled",
    });
  }, TypeError);
  // The caller's task object was NOT frozen by the execution (cloned in).
  const freshTask = clipTask({ instanceId: clip.instanceId });
  const fourth = await stack.execution.executePawn(SCOPE_ALPHA, freshTask);
  (freshTask.parameters as Record<string, unknown>).clipCount = 42;
  assert.deepEqual(fourth.parameters, { clipCount: 3 });

  // Tenant scoping: no existence leaks across tenants.
  assert.equal(stack.execution.getPawnExecution(SCOPE_BETA, first.executionId), undefined);
  assert.deepEqual(stack.execution.listPawnExecutions(SCOPE_BETA), []);
  assert.ok(stack.execution.getPawnExecution(SCOPE_ALPHA, first.executionId) !== undefined);

  // The submitted jobs keep flowing through the seam on every engine-matched
  // execution (first: clip engine job; second: capability unmatched → none;
  // third: rights denial PRECEDES the engine → none; fourth: clip again → 1).
  assert.equal(stack.doubles.engineRunner.submissions.length, 2);
});

test("a no-requirement transform (no-op repost vocabulary) executes with zero engine jobs", async () => {
  const stack = composePawnStack();
  const critic = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "quality-critic" });
  const record = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({
      instanceId: critic.instanceId,
      transformApplication: { definitionId: "transform:noop-repost" as never, definitionVersion: 1 as never },
      engineResourceLimits: undefined,
    }),
  );
  assert.equal(record.lifecycle, "succeeded");
  assert.deepEqual(record.engineInvocations, []);
  assert.equal(stack.doubles.engineRunner.submissions.length, 0);
  assert.equal(record.modelBinding, null);
});

test("an organization citation is resolved fail-closed and echoed on the record", async () => {
  const stack = composePawnStack();
  const clip = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const citation = { organizationId: "org:does-not-exist" as never, version: 1 as never };
  await assert.rejects(
    () => stack.execution.executePawn(SCOPE_ALPHA, clipTask({ instanceId: clip.instanceId, organization: citation })),
    (error: unknown) => error instanceof PawnExecutionError && error.code === "organization-unresolved",
  );

  const organization = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, {
    scope: SCOPE_ALPHA,
    organizationId: "org:clip-pipeline" as never,
    nodes: [
      { nodeId: "selector", pawnKind: "clip-selection" },
      { nodeId: "critic", pawnKind: "quality-critic" },
    ],
    edges: [{ fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" }],
    evaluator: "evaluator:org/clip-pipeline",
  });
  const record = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({
      instanceId: clip.instanceId,
      organization: { organizationId: organization.id, version: organization.version },
    }),
  );
  assert.equal(record.lifecycle, "succeeded");
  assert.deepEqual(record.organization, { organizationId: organization.id, version: 1 as never });
});

test("service actors cannot hold grants: the gate denies with the verbatim reason", async () => {
  const stack = composePawnStack();
  const clip = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(
    SCOPE_ALPHA,
    clipTask({ instanceId: clip.instanceId, actor: { kind: "service", name: "orchestrator" } }),
  );
  assert.equal(record.lifecycle, "failed");
  assert.equal(record.failure?.code, "rights-denied");
  assert.equal(record.rights.denialReason, "grantee-not-covered");
});

test("engine submission options never grant network implicitly (parity-only seam)", async () => {
  const stack = composePawnStack();
  const clip = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  await stack.execution.executePawn(SCOPE_ALPHA, clipTask({ instanceId: clip.instanceId }));
  const submission = stack.doubles.engineRunner.submissions[0];
  assert.ok(submission !== undefined);
  const options: PawnEngineJobSubmissionOptions | undefined = submission.submissionOptions;
  // Pawns never submit a network grant: the option is absent.
  assert.equal(options, undefined);
});

/**
 * The pawn execution flow (LAB-013) — one declared task against one pawn
 * instance, through the seams, into an append-only §30 record.
 *
 * Phases, in order:
 * 1. caller-error preconditions (typed throws, NO record): instance
 *    resolution, transform resolution + kind served, artifact resolution
 *    (digest/type), organization citation, engine-quota grant presence;
 * 2. the recorded production action: unbound-llm check, the rights gate
 *    (PRECEDES every engine/agent invocation), deterministic engine
 *    invocations THROUGH the runner seam, agent-instance execution through
 *    the executor seam (llm-flavored pawns only), finalize.
 *
 * Model assignment never happens here: the instance's boundary-issued
 * binding is read as provenance data only (pinned by
 * src/no-second-runtime.test.ts).
 */

import type {
  ArtifactRef,
  EngineJob,
  EngineJobId,
  JsonObject,
  TenantScope,
  Timestamp,
} from "@mos/contracts";

import { PawnExecutionError } from "../domain/errors.js";
import { assertValidTransformPawnTask } from "../domain/pawn-task-validation.js";
import { deepFreezeRecord } from "./registry-support.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";
import type { TransformPawnTask } from "../contracts/pawn-task.js";
import type {
  PawnAgentExecutionEvent,
  PawnAgentExecutionRecord,
  PawnEngineInvocationRecord,
  PawnExecutionRecord,
} from "../contracts/pawn-execution.js";
import type { PawnEngineToolBinding } from "../contracts/pawn-role.js";
import type { PawnExecutionId, PawnInstanceId } from "../contracts/pawn-ids.js";
import type {
  PawnInstanceExecutorPort,
  PawnInstanceRecord,
  PawnExecutionJsonValue,
} from "../ports/agent-stack.ports.js";
import type { PawnEngineRunnerPort } from "../ports/engine-runner.port.js";
import type { PawnTransformSourcePort } from "../ports/transform-source.port.js";
import type { PawnArtifactSourcePort } from "../ports/artifact-source.port.js";
import type { PawnRightsGatePort } from "../ports/rights-gate.port.js";
import { createPawnExecutionRecorder } from "./pawn-execution-recording.js";
import type { PawnOrganizationSource } from "./in-memory-pawn-execution.js";

/** The frozen rights action of a pawn transform execution. */
const TRANSFORM_ACTION = "transform" as const;

/** The seams + state one execution needs (supplied by the runtime adapter). */
export interface PawnExecutionRunDeps {
  /** Instance resolution (the instance-registry seam's read surface). */
  readonly instances: {
    get(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord | undefined;
  };
  readonly transformSource: PawnTransformSourcePort;
  readonly artifactSource: PawnArtifactSourcePort;
  readonly rightsGate: PawnRightsGatePort;
  readonly engineRunner: PawnEngineRunnerPort;
  readonly executor: PawnInstanceExecutorPort;
  readonly organizationSource?: PawnOrganizationSource;
  /** Resolves the registered pawn body of one instance (fail-closed). */
  readonly pawnOfInstance: (record: PawnInstanceRecord) => TransformPawnBody;
  /** Appends the finished record to the tenant's history (append-only). */
  readonly append: (record: PawnExecutionRecord) => void;
  readonly now: () => Timestamp;
  readonly executionIdFactory: () => PawnExecutionId;
  readonly engineJobIdFactory: () => EngineJobId;
}

/** Projects an unknown value onto the JSON-value space (executor input). */
function jsonSafe(value: unknown): PawnExecutionJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonSafe(item));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, PawnExecutionJsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = jsonSafe(item);
    }
    return out;
  }
  return String(value);
}

/** The instance's boundary-issued model binding as record provenance DATA. */
function modelBindingOf(instance: PawnInstanceRecord): PawnExecutionRecord["modelBinding"] {
  return instance.lifecycle === "bound" &&
    instance.modelRef !== undefined &&
    instance.runtimeRef !== undefined &&
    instance.boundAt !== undefined
    ? {
        modelRef: instance.modelRef,
        runtimeRef: instance.runtimeRef,
        boundAt: instance.boundAt,
      }
    : null;
}

/** Runs one declared pawn task end-to-end and returns the §30 record. */
export async function runPawnExecution(
  scope: TenantScope,
  task: TransformPawnTask,
  deps: PawnExecutionRunDeps,
): Promise<PawnExecutionRecord> {
  // ---- Phase 1: caller-error preconditions (thrown; no record) ----
  assertValidTransformPawnTask(task);
  const instance = deps.instances.get(scope, task.instanceId);
  if (instance === undefined) {
    throw new PawnExecutionError(
      "unknown-pawn-instance",
      `Unknown pawn instance: ${task.instanceId as string} (not registered for this tenant)`,
    );
  }
  if (instance.lifecycle === "released") {
    throw new PawnExecutionError(
      "pawn-instance-released",
      `pawn instance ${task.instanceId as string} is released and cannot execute`,
    );
  }
  const pawn = deps.pawnOfInstance(instance);
  const role = pawn.role;

  const definition = await deps.transformSource.resolve(
    scope,
    task.transformApplication.definitionId,
    task.transformApplication.definitionVersion,
  );
  if (definition === null) {
    throw new PawnExecutionError(
      "transform-application-unresolved",
      `transform definition ${task.transformApplication.definitionId as string}@${task.transformApplication.definitionVersion as number} does not resolve in this tenant scope (unknown or cross-tenant)`,
    );
  }
  if (!(role.servedTransformKinds as readonly string[]).includes(definition.kind)) {
    throw new PawnExecutionError(
      "transform-kind-not-served",
      `pawn kind ${String(role.pawnKind)} serves [${(role.servedTransformKinds as readonly string[]).join(", ")}] — not ${definition.kind}`,
    );
  }
  const resolvedArtifacts: { ref: ArtifactRef; type: string }[] = [];
  for (const ref of task.inputArtifactRefs) {
    const resolved = await deps.artifactSource.resolve(scope, ref);
    if (resolved === null) {
      throw new PawnExecutionError(
        "input-artifact-unresolved",
        `input artifact ${ref.artifactId as string}@${ref.version as number} does not resolve in this tenant scope (unknown or cross-tenant)`,
      );
    }
    if ((resolved.digest as string) !== (ref.digest as string)) {
      throw new PawnExecutionError(
        "artifact-digest-mismatch",
        `input artifact ${ref.artifactId as string}@${ref.version as number} cites digest ${ref.digest as string} but the artifact authority records ${resolved.digest as string}`,
      );
    }
    if (!(definition.inputTypes as readonly string[]).includes(resolved.type)) {
      throw new PawnExecutionError(
        "transform-input-type-not-declared",
        `input artifact ${ref.artifactId as string} has type ${resolved.type}, which the transform does not declare (declared: ${(definition.inputTypes as readonly string[]).join(", ")})`,
      );
    }
    resolvedArtifacts.push({ ref, type: resolved.type });
  }
  if (task.organization !== undefined) {
    const organization = deps.organizationSource?.get(
      scope,
      task.organization.organizationId,
      task.organization.version,
    );
    if (organization === undefined) {
      throw new PawnExecutionError(
        "organization-unresolved",
        `organization citation ${task.organization.organizationId as string}@${task.organization.version as number} does not resolve in this tenant scope`,
      );
    }
  }

  // Requirement matching: the pawn's engine tools that satisfy the
  // transform's declared capability requirements.
  const requiredCapabilityIds = new Set(
    (definition.capabilityRequirements ?? []).map(
      (requirement: { capabilityId: string }) => requirement.capabilityId,
    ),
  );
  const matchedTools: readonly PawnEngineToolBinding[] = role.engineTools.filter(
    (binding) => requiredCapabilityIds.has(binding.capabilityId as string),
  );
  if (matchedTools.length > 0 && task.engineResourceLimits === undefined) {
    throw new PawnExecutionError(
      "engine-resource-limits-required",
      "this execution submits EngineJobs — engineResourceLimits must be granted explicitly (§11: no implicit quotas)",
    );
  }

  // ---- Phase 2: the recorded production action ----
  const recorder = createPawnExecutionRecorder({
    executionId: deps.executionIdFactory(),
    scope,
    task,
    instance,
    pawn,
    definition,
    now: deps.now,
    startedAt: deps.now(),
    append: deps.append,
  });
  recorder.auditEvent(
    "execution-started",
    `pawn ${String(role.pawnKind)} instance ${task.instanceId as string} applying ${task.transformApplication.definitionId as string}@${task.transformApplication.definitionVersion as number}`,
  );
  const modelBinding = modelBindingOf(instance);

  // ---- Unbound llm-flavored instance: a RECORDED failure ----
  if (role.modelFlavor === "llm-flavored" && instance.lifecycle !== "bound") {
    return recorder.finalize({
      lifecycle: "failed",
      failure: {
        code: "pawn-instance-not-bound",
        message: `pawn instance ${task.instanceId as string} is llm-flavored and was executed without a model binding`,
        detail: instance.lifecycle,
        retriable: true,
      },
      engineInvocations: [],
      agentExecution: null,
      rights: { verdict: "granted", denialReason: null, grantRef: null, subjectsEvaluated: 0 },
      modelBinding: null,
      extraWarnings: [],
    });
  }

  // ---- Rights gate PRECEDES every engine/agent invocation ----
  const rightsVerdict = deps.rightsGate.check({
    scope,
    grantee: task.actor.kind === "identity" ? task.actor.principalId : `service:${task.actor.name}`,
    subjectRefs: (task.inputArtifactRefs as readonly ArtifactRef[]).map(
      (ref) => ref.artifactId as string,
    ),
    action: TRANSFORM_ACTION,
  });
  recorder.auditEvent(
    "rights-evaluated",
    rightsVerdict.allowed
      ? `granted (${rightsVerdict.subjectsEvaluated} subjects)`
      : `denied: ${String(rightsVerdict.denialReason)}`,
  );
  const rightsRecord: PawnExecutionRecord["rights"] = {
    verdict: rightsVerdict.allowed ? "granted" : "denied",
    denialReason: rightsVerdict.denialReason ?? null,
    grantRef: rightsVerdict.grantRef ?? null,
    subjectsEvaluated: rightsVerdict.subjectsEvaluated,
  };
  if (!rightsVerdict.allowed) {
    return recorder.finalize({
      lifecycle: "failed",
      failure: {
        code: "rights-denied",
        message: `the rights gate denied the transform application (${String(rightsVerdict.denialReason)})`,
        detail: rightsVerdict.denialReason ?? null,
        retriable: false,
      },
      engineInvocations: [],
      agentExecution: null,
      rights: rightsRecord,
      modelBinding,
      extraWarnings: [],
    });
  }

  // ---- Deterministic engine invocations (THROUGH the runner seam) ----
  const engineInvocations: PawnEngineInvocationRecord[] = [];
  for (const binding of matchedTools) {
    const job: EngineJob = {
      id: deps.engineJobIdFactory(),
      capabilityId: binding.capabilityId,
      capabilityVersion: binding.capabilityVersion,
      engineId: binding.engineId,
      engineVersion: binding.engineVersion,
      inputArtifactRefs: task.inputArtifactRefs,
      parameters: task.parameters as JsonObject,
      seed: task.seed,
      resourceLimits: task.engineResourceLimits as EngineJob["resourceLimits"],
      outputContract: task.engineOutputContract ?? { type: "object" },
    };
    recorder.auditEvent(
      "engine-job-submitted",
      `${job.id as string} ${binding.capabilityId as string} via ${binding.engineId as string}@${binding.engineVersion as number}`,
    );
    const result = await deps.engineRunner.submit(job);
    const failed = result.failure !== null;
    const invocation: PawnEngineInvocationRecord = deepFreezeRecord({
      jobId: job.id,
      capabilityId: job.capabilityId,
      capabilityVersion: job.capabilityVersion,
      engineId: job.engineId,
      engineVersion: job.engineVersion,
      lifecycle: failed ? "failed" : "succeeded",
      failure: result.failure,
      warnings: result.warnings,
      outputArtifactRefs: result.outputArtifactRefs,
      metrics: result.metrics,
      provenance: result.provenance,
      durationMs: result.duration,
      cost: result.cost,
    });
    engineInvocations.push(invocation);
    recorder.auditEvent(
      failed ? "engine-job-failed" : "engine-job-completed",
      failed
        ? `${job.id as string} failed: ${result.failure?.code ?? "unknown"}`
        : `${job.id as string} completed (${(result.outputArtifactRefs ?? []).length} outputs)`,
    );
    if (failed) {
      return recorder.finalize({
        lifecycle: "failed",
        failure: {
          code: "engine-invocation-failed",
          message: `engine invocation ${job.id as string} failed (${result.failure?.code ?? "unknown"}): ${result.failure?.message ?? ""}`,
          detail: result.failure?.code ?? null,
          retriable: result.failure?.retriable ?? false,
        },
        engineInvocations,
        agentExecution: null,
        rights: rightsRecord,
        modelBinding,
        extraWarnings: [],
      });
    }
  }

  // ---- Agent-instance execution (llm-flavored pawns, through the executor seam) ----
  if (role.modelFlavor === "llm-flavored") {
    const input = jsonSafe({
      pawnKind: role.pawnKind,
      transformApplication: {
        definitionId: task.transformApplication.definitionId,
        definitionVersion: task.transformApplication.definitionVersion,
        kind: definition.kind,
      },
      parameters: task.parameters,
      inputArtifactIds: resolvedArtifacts.map((entry) => entry.ref.artifactId),
      engineOutputArtifactIds: engineInvocations.flatMap((invocation) =>
        (invocation.outputArtifactRefs as readonly ArtifactRef[]).map((ref) => ref.artifactId),
      ),
      seed: task.seed,
    });
    recorder.auditEvent("agent-execution-started", `instance ${task.instanceId as string}`);
    let outcome;
    try {
      outcome = await deps.executor.execute(instance, input);
    } catch (error) {
      recorder.auditEvent(
        "agent-execution-completed",
        `executor raised: ${error instanceof Error ? error.message : String(error)}`,
      );
      return recorder.finalize({
        lifecycle: "failed",
        failure: {
          code: "agent-execution-failed",
          message: `agent execution of instance ${task.instanceId as string} failed: ${error instanceof Error ? error.message : String(error)}`,
          detail: error instanceof PawnExecutionError ? error.code : null,
          retriable: true,
        },
        engineInvocations,
        agentExecution: null,
        rights: rightsRecord,
        modelBinding,
        extraWarnings: [],
      });
    }
    recorder.auditEvent("agent-execution-completed", `finishReason ${outcome.finishReason}`);
    const agentExecution: PawnAgentExecutionRecord = deepFreezeRecord({
      finishReason: outcome.finishReason,
      output: outcome.output,
      usage: outcome.usage,
      events: outcome.events as readonly PawnAgentExecutionEvent[],
    });
    if (outcome.finishReason !== "completed") {
      return recorder.finalize({
        lifecycle: "failed",
        failure: {
          code: "agent-execution-failed",
          message: `agent execution of instance ${task.instanceId as string} finished '${outcome.finishReason}' (only 'completed' is a success)`,
          detail: outcome.finishReason,
          retriable:
            outcome.finishReason === "budget-exhausted" || outcome.finishReason === "timeout",
        },
        engineInvocations,
        agentExecution,
        rights: rightsRecord,
        modelBinding,
        extraWarnings: [],
      });
    }
    return recorder.finalize({
      lifecycle: "succeeded",
      failure: null,
      engineInvocations,
      agentExecution,
      rights: rightsRecord,
      modelBinding,
      extraWarnings: [],
    });
  }

  // ---- Deterministic pawn: engine outputs are the execution outputs ----
  return recorder.finalize({
    lifecycle: "succeeded",
    failure: null,
    engineInvocations,
    agentExecution: null,
    rights: rightsRecord,
    modelBinding,
    extraWarnings: [],
  });
}

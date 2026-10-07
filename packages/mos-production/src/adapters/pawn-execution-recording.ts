/**
 * Pawn execution recording support (LAB-013) — the §30 record builder +
 * append-only history writer shared by the execution runtime.
 *
 * One recorder instance serves ONE execution: it owns the chronological
 * audit trace and the finalize step that assembles the complete §30
 * production-action record (every field of the observability list — see
 * contracts/pawn-execution.ts for the field-by-field mapping), deep-freezes
 * it and appends it to the tenant's history. Records never rewrite.
 *
 * The recorder carries NO model-selection surface: the model-binding
 * provenance arrives as DATA on the finalize input (computed in the runtime
 * adapter from the instance's boundary-issued binding — pinned by
 * src/no-second-runtime.test.ts).
 */

import type {
  ArtifactRef,
  EngineWarning,
  MoneyAmount,
  TenantScope,
  Timestamp,
} from "@mos/contracts";

import { deepFreezeRecord } from "./registry-support.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";
import type { TransformPawnTask } from "../contracts/pawn-task.js";
import type {
  PawnAgentExecutionRecord,
  PawnEngineInvocationRecord,
  PawnExecutionAuditEvent,
  PawnExecutionEvaluation,
  PawnExecutionFailure,
  PawnExecutionRecord,
  PawnModelBindingRecord,
  PawnRightsVerdictRecord,
} from "../contracts/pawn-execution.js";
import type { ResolvedPawnTransform } from "../ports/transform-source.port.js";
import type { PawnInstanceRecord } from "../ports/agent-stack.ports.js";
import type { PawnExecutionId } from "../contracts/pawn-ids.js";

// ---------------------------------------------------------------------------
// Pure aggregation helpers
// ---------------------------------------------------------------------------

/** Merges metric records (later values win; deterministic order preserved). */
export function mergeMetrics(
  invocations: readonly PawnEngineInvocationRecord[],
): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const invocation of invocations) {
    for (const [key, value] of Object.entries(invocation.metrics)) {
      metrics[key] = value;
    }
  }
  return metrics;
}

/** Sums engine costs (single currency; a warning describes any mix). */
export function sumCosts(
  invocations: readonly PawnEngineInvocationRecord[],
): { cost: MoneyAmount; mixedCurrencyWarning: EngineWarning | null } {
  let amount = 0;
  let currency: string | null = null;
  let mixed = false;
  for (const invocation of invocations) {
    if (invocation.cost === null) continue;
    if (currency === null) currency = invocation.cost.currency;
    else if (currency !== invocation.cost.currency) mixed = true;
    amount += invocation.cost.amount;
  }
  return {
    cost: { amount, currency: currency ?? "USD" },
    mixedCurrencyWarning: mixed
      ? {
          code: "mixed-cost-currencies",
          message: "engine invocations cited more than one currency; the recorded total uses the first currency",
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// The per-execution recorder
// ---------------------------------------------------------------------------

/** The execution context the recorder closes over. */
export interface PawnExecutionRecorderContext {
  readonly executionId: PawnExecutionId;
  readonly scope: TenantScope;
  readonly task: TransformPawnTask;
  readonly instance: PawnInstanceRecord;
  readonly pawn: TransformPawnBody;
  readonly definition: ResolvedPawnTransform;
  readonly now: () => Timestamp;
  readonly startedAt: Timestamp;
  /** Appends the finished record to the tenant's history (append-only). */
  readonly append: (record: PawnExecutionRecord) => void;
}

/** The finalize input: everything the runtime decided for this execution. */
export interface PawnExecutionFinalizeInput {
  readonly lifecycle: PawnExecutionRecord["lifecycle"];
  readonly failure: PawnExecutionFailure | null;
  readonly engineInvocations: readonly PawnEngineInvocationRecord[];
  readonly agentExecution: PawnAgentExecutionRecord | null;
  readonly rights: PawnRightsVerdictRecord;
  readonly modelBinding: PawnModelBindingRecord | null;
  readonly extraWarnings: readonly EngineWarning[];
}

/** One execution's audit trace + §30 record assembler. */
export interface PawnExecutionRecorder {
  /** Appends one chronological audit event to the trace. */
  auditEvent(type: PawnExecutionAuditEvent["type"], detail: string): void;
  /** Assembles, deep-freezes, appends and returns the execution record. */
  finalize(input: PawnExecutionFinalizeInput): PawnExecutionRecord;
}

/** Creates the recorder for one execution (owns its audit trace). */
export function createPawnExecutionRecorder(
  context: PawnExecutionRecorderContext,
): PawnExecutionRecorder {
  const audit: PawnExecutionAuditEvent[] = [];
  const { task, instance, pawn, definition, now } = context;
  const auditEvent = (
    type: PawnExecutionAuditEvent["type"],
    detail: string,
  ): void => {
    audit.push({ type, occurredAt: now(), detail });
  };

  return {
    auditEvent,

    finalize(input: PawnExecutionFinalizeInput): PawnExecutionRecord {
      const completedAt = now();
      const { cost, mixedCurrencyWarning } = sumCosts(input.engineInvocations);
      const warnings: EngineWarning[] = [
        ...input.engineInvocations.flatMap(
          (invocation) => invocation.warnings as readonly EngineWarning[],
        ),
        ...(mixedCurrencyWarning === null ? [] : [mixedCurrencyWarning]),
        ...input.extraWarnings,
      ];
      const evaluation: PawnExecutionEvaluation = {
        evaluator: pawn.agentBody.evaluator,
        engineMetrics: Object.freeze(mergeMetrics(input.engineInvocations)),
      };
      const outputArtifactRefs: ArtifactRef[] = input.engineInvocations.flatMap(
        (invocation) => invocation.outputArtifactRefs as readonly ArtifactRef[],
      );
      auditEvent(
        input.lifecycle === "succeeded" ? "execution-completed" : "execution-failed",
        input.failure === null
          ? `${context.executionId as string} succeeded`
          : `${context.executionId as string} failed: ${input.failure.code}`,
      );
      const record: PawnExecutionRecord = deepFreezeRecord({
        executionId: context.executionId,
        contractVersion: "pawn-execution/1",
        tenantId: context.scope.tenantId,
        // CALLER-OWNED task fields are CLONED into the record so the stored
        // snapshot never shares mutable state with the caller (and the deep
        // freeze below never reaches into the caller's objects).
        actor: structuredClone(task.actor),
        pawnKind: pawn.role.pawnKind,
        instanceId: task.instanceId,
        bodyId: instance.bodyId,
        bodyVersion: instance.bodyVersion,
        modelBinding: input.modelBinding,
        organization: task.organization === undefined ? null : structuredClone(task.organization),
        transformApplication: structuredClone(task.transformApplication),
        transformKind: definition.kind,
        parameters: structuredClone(task.parameters),
        seed: task.seed,
        inputArtifactRefs: structuredClone(task.inputArtifactRefs),
        outputArtifactRefs,
        engineInvocations: input.engineInvocations,
        agentExecution: input.agentExecution,
        rights: input.rights,
        lifecycle: input.lifecycle,
        failure: input.failure,
        warnings,
        cost,
        durationMs: Math.max(0, Date.parse(completedAt as string) - Date.parse(context.startedAt as string)),
        evaluation,
        auditTrace: [...audit],
        startedAt: context.startedAt,
        completedAt,
        transformDefinitionId: task.transformApplication.definitionId,
        transformDefinitionVersion: task.transformApplication.definitionVersion,
      });
      context.append(record);
      return record;
    },
  };
}

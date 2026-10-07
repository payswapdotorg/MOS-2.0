/**
 * Editing-session support helpers (STUDIO-008) — the §30 summary/record
 * builders, cost/lineage projections and the final-assembly step shared
 * by the editing runtime.
 *
 * Everything here is a pure projection over pawn execution records and
 * studio contracts (plus the final-assembly execution through the injected
 * compose-step executor): no stores, no hidden side effects. Typed engine
 * failures pass through VERBATIM (the summaries quote the runner's failure
 * code/message exactly — never re-interpreted).
 */

import type { MoneyAmount as CanonicalMoneyAmount, TenantScope } from "@mos/contracts";

import type {
  CompositionOperationDeclaration,
  EditingCompositionFailure,
  EditingEngineInvocationSummary,
  EditingSessionRecord,
  OrganizationEditChoice,
} from "../../contracts/editing-composition.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type { ContractVersion, Timestamp } from "../../contracts/refs.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import {
  executionFailureDetailOf,
  FINAL_ASSEMBLY_OPERATION_ID,
  type EditorCompositionRun,
} from "./editor-pawn-binding.js";

const ZERO_COST: CanonicalMoneyAmount = { amount: 0, currency: "USD" };

/** Sums §30 costs of one editing session (single currency, no float drift). */
export function sumCosts(costs: readonly CanonicalMoneyAmount[]): CanonicalMoneyAmount {
  if (costs.length === 0) return { ...ZERO_COST };
  const currency = costs[0]?.currency ?? "USD";
  const total = costs.reduce((sum, entry) => sum + entry.amount, 0);
  return { amount: total, currency };
}

/** Elapsed milliseconds between two ISO stamps (never negative). */
export function elapsedMs(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

/** Deterministic manifest bytes for a new studio-side composition artifact. */
export function compositionManifestBytes(value: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** The §30 engine-invocation summaries of one pawn execution record. */
export function invocationSummariesOf(run: EditorCompositionRun): EditingEngineInvocationSummary[] {
  return run.record.engineInvocations.map((invocation) => ({
    executionId: String(run.record.executionId),
    jobId: String(invocation.jobId),
    engineId: String(invocation.engineId),
    engineVersion: Number(invocation.engineVersion),
    capabilityId: String(invocation.capabilityId),
    capabilityVersion: Number(invocation.capabilityVersion),
    lifecycle: invocation.lifecycle,
    failureCode: invocation.failure === null ? null : String(invocation.failure.code),
    failureMessage: invocation.failure === null ? null : String(invocation.failure.message),
    durationMs: Number(invocation.durationMs ?? 0),
    cost: invocation.cost ?? { ...ZERO_COST },
    outputArtifactRefs: [...invocation.outputArtifactRefs],
  }));
}

/** Flattens the org choices into ordered (choice, operation) pairs (recorded order). */
export function operationsOf(
  choices: readonly OrganizationEditChoice[],
): readonly {
  readonly choice: OrganizationEditChoice;
  readonly operation: CompositionOperationDeclaration;
}[] {
  const pairs: { choice: OrganizationEditChoice; operation: CompositionOperationDeclaration }[] = [];
  for (const choice of choices) {
    for (const operation of choice.operations) {
      pairs.push({ choice, operation });
    }
  }
  return pairs;
}

/** Output artifact type of one executed operation (engine-reported, else the input's). */
export function operationOutputType(
  operation: CompositionOperationDeclaration,
  run: EditorCompositionRun,
  fallback: StudioArtifactRef["type"],
): StudioArtifactRef["type"] {
  const engineOutput = run.record.engineInvocations.flatMap((invocation) => [
    ...invocation.outputArtifactRefs,
  ])[0];
  if (engineOutput !== undefined) {
    return engineOutput.type as StudioArtifactRef["type"];
  }
  return (operation.inputArtifactRefs[0]?.type ?? fallback) as StudioArtifactRef["type"];
}

/** The fields of a §30 editing session record shared by success and failure. */
export interface SessionRecordBaseInput {
  readonly editingSessionId: EditingSessionRecord["editingSessionId"];
  readonly tenantId: EditingSessionRecord["tenantId"];
  readonly actor: EditingSessionRecord["actor"];
  readonly organization: StudioOrganizationRef;
  readonly formatId: EditingSessionRecord["formatId"];
  readonly source: EditingSessionRecord["source"];
  readonly editorPawn: EditingSessionRecord["editorPawn"];
  readonly engineInvocations: readonly EditingEngineInvocationSummary[];
  readonly startedAt: Timestamp;
  readonly artifactIds: readonly string[];
  readonly provenance: EditingSessionRecord["provenance"];
}

/** Builds the FAILED §30 session record (the composing started — failures are auditable). */
export function failedSessionRecord(
  base: SessionRecordBaseInput,
  failure: EditingCompositionFailure,
  completedAt: Timestamp,
): EditingSessionRecord {
  return {
    editingSessionId: base.editingSessionId,
    contractVersion: "editing-session/1",
    tenantId: base.tenantId,
    actor: base.actor,
    organization: base.organization,
    formatId: base.formatId,
    source: base.source,
    resultPackage: null,
    editGraph: null,
    editorPawn: base.editorPawn,
    engineInvocations: Object.freeze([...base.engineInvocations]),
    lifecycle: "failed",
    failure,
    cost: sumCosts(base.engineInvocations.map((invocation) => invocation.cost)),
    durationMs: elapsedMs(base.startedAt, completedAt),
    startedAt: base.startedAt,
    completedAt,
    provenance: base.provenance,
    artifactIds: Object.freeze([...base.artifactIds]),
  };
}

/** Assigns the next treatment version of one package in a tenant (W3-C discipline). */
export function nextPackageVersion(
  sourceVersion: ContractVersion | null,
  latestAssigned: ContractVersion,
): ContractVersion {
  const base = Math.max(sourceVersion ?? 0, latestAssigned);
  return base + 1;
}

// ---------------------------------------------------------------------------
// The final assembly step (Phase 4 of the session flow)
// ---------------------------------------------------------------------------

/** The composition-step executor handed to {@link runFinalAssemblyStep}. */
export type ComposeStepExecutor = (
  operationId: string,
  kind: "assemble",
  parameters: Record<string, unknown>,
  inputArtifactRefs: readonly StudioArtifactRef[],
) => Promise<EditorCompositionRun>;

/** Dependencies of {@link runFinalAssemblyStep}. */
export interface FinalAssemblyStepInput {
  readonly composeStep: ComposeStepExecutor;
  readonly artifactFactory: StudioArtifactFactoryPort;
  readonly scope: TenantScope;
  readonly editingSessionId: string;
  readonly operationOutputs: readonly StudioArtifactRef[];
}

/** The outcome of the final assembly step. */
export type FinalAssemblyStepOutcome =
  | {
      readonly ok: true;
      readonly finalArtifact: StudioArtifactRef;
      readonly invocations: readonly EditingEngineInvocationSummary[];
    }
  | {
      readonly ok: false;
      readonly failure: EditingCompositionFailure;
      readonly invocations: readonly EditingEngineInvocationSummary[];
    };

/**
 * Runs the editor pawn's final assembly execution over the operation
 * outputs (§9 core duty) and versions the new final candidate through the
 * artifact factory (lineage: parents = all operation outputs).
 */
export async function runFinalAssemblyStep(
  input: FinalAssemblyStepInput,
): Promise<FinalAssemblyStepOutcome> {
  const assemblyRun = await input.composeStep(
    FINAL_ASSEMBLY_OPERATION_ID,
    "assemble",
    { operationCount: input.operationOutputs.length },
    input.operationOutputs,
  );
  const invocations = invocationSummariesOf(assemblyRun);
  if (assemblyRun.record.lifecycle !== "succeeded") {
    return {
      ok: false,
      failure: {
        kind: "editor-pawn-composition-failed",
        operationId: FINAL_ASSEMBLY_OPERATION_ID,
        failure: executionFailureDetailOf(assemblyRun.record),
      },
      invocations,
    };
  }
  const assemblyOutput = assemblyRun.record.engineInvocations.flatMap((invocation) => [
    ...invocation.outputArtifactRefs,
  ])[0];
  const lastOutput = input.operationOutputs[input.operationOutputs.length - 1];
  const assemblyCreation = await input.artifactFactory.createArtifact({
    tenantId: input.scope.tenantId,
    type: (assemblyOutput?.type ?? lastOutput?.type ?? "timeline") as StudioArtifactRef["type"],
    stage: "final",
    creationMethod: "composition",
    storageRef: `mos-studio:composition:${input.editingSessionId}:final` as StudioArtifactRef["storageRef"],
    content: compositionManifestBytes({
      compositionStep: FINAL_ASSEMBLY_OPERATION_ID,
      operationOutputs: input.operationOutputs.map((artifact) => ({
        artifactId: String(artifact.artifactId),
        version: Number(artifact.version),
      })),
      engineInvocations: assemblyRun.record.engineInvocations.map((invocation) => ({
        jobId: String(invocation.jobId),
        engineId: String(invocation.engineId),
        engineVersion: Number(invocation.engineVersion),
      })),
    }),
    rightsRef: (input.operationOutputs[0]?.rightsRef ??
      "mos-studio:editing:inherited") as StudioArtifactRef["rightsRef"],
    provenanceRef: `mos-studio:composition-provenance:${input.editingSessionId}:final` as StudioArtifactRef["provenanceRef"],
    parents: [...input.operationOutputs],
  });
  if (!assemblyCreation.ok) {
    return {
      ok: false,
      failure: { kind: "final-assembly-failed", reason: JSON.stringify(assemblyCreation.error) },
      invocations,
    };
  }
  return { ok: true, finalArtifact: assemblyCreation.artifact, invocations };
}

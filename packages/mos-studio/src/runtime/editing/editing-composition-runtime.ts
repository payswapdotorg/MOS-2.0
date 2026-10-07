/**
 * The editing/composition runtime (STUDIO-008) — the EditingCompositionPort
 * implementation.
 *
 * The session flow (the ORG DECIDES, THE STUDIO RECORDS):
 * 1. VALIDATION (typed failures, NO session record — no production action
 *    ran): seed/engine-grant shape, org choices against the format's
 *    DECLARED edit decision points (the W3-C pin extended — undeclared
 *    points rejected), the closed edit-kind vocabulary, operation inputs
 *    resolving in the edited source, tenant scoping, and the §15
 *    multi-account CONSENT GATE (every contributor must hold processing
 *    consent before any composition runs — W2-C discipline);
 * 2. the W7-B EDITOR PAWN is composed through the production package's
 *    surfaces (deterministic, NO model binding);
 * 3. every declared composition operation executes through the editor pawn
 *    (engine invocations are EngineJobs through the engines runner seam —
 *    typed failures pass through VERBATIM); each output is a NEW immutable
 *    studio-side intermediate version through the ArtifactFactoryPort
 *    (CORE-004 discipline: parents = the operation's declared inputs);
 * 4. one FINAL ASSEMBLY execution assembles the operation outputs into the
 *    new final candidate (lineage: parents = all operation outputs);
 * 5. the EDIT GRAPH is recorded (org-supplied choices with provenance +
 *    executed operations with in/out refs + engine-invocation summaries);
 * 6. the NEW IMMUTABLE PACKAGE VERSION is assembled (treatment-versioned
 *    like W3-C: same package id at version+1, or a new package for an
 *    intermediates source; predecessors never mutated);
 * 7. the §30 session record is appended (tenant-scoped, append-only) and
 *    the pawn instance is released.
 *
 * A session with ZERO operations is the honest NO-OP editing session
 * (lock rule 5: no-op is first-class): the org decided to change nothing,
 * the new package version records the no-op edit graph.
 *
 * DISCLOSED (the composition seam, src/testing/compose-editing-stack.ts):
 * the artifact factory is the disclosed in-memory double; the editor pawn
 * runs on production's in-memory execution runtime over REAL agent-stack
 * registries and the REAL engines runner with the disclosed test-double
 * engine adapter — the production TL composition root binds durable
 * stores and real engines behind the same ports.
 */

import type { TenantScope } from "@mos/contracts";
import type {
  PawnInstanceId,
  PawnInstanceRecord,
  PawnExecutionPort,
} from "@mos/production";

import type {
  CompositionOperationDeclaration,
  EditGraphVersionRef,
  EditingCompositionFailure,
  EditingSessionInput,
  EditingSessionOutcome,
  EditingSessionRecord,
  EditingSessionResult,
  EditorPawnCitation,
  RecordedCompositionOperation,
  RecordedEditChoice,
} from "../../contracts/editing-composition.js";
import type { EditGraphImportOutcome } from "../../contracts/edit-graph-interop.js";
import type {
  ContractVersion,
  EditGraphId,
  EditingSessionId,
  StudioArtifactPackageId,
  Timestamp,
} from "../../contracts/refs.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { ParticipantConsentPort } from "../../ports/participant-consent.js";
import type { EditingCompositionPort } from "../../ports/editing-composition.port.js";
import {
  createEditorPawnBinding,
  executionFailureDetailOf,
  FINAL_ASSEMBLY_OPERATION_ID,
  type EditorCompositionRun,
} from "./editor-pawn-binding.js";
import {
  createEditingGraphStore,
  type EditingGraphStore,
} from "./editing-graph-store.js";
import { compareEditGraphVersions } from "./editing-graph-comparison.js";
import {
  assembleNewPackageVersion,
} from "./editing-package-assembly.js";
import {
  compositionManifestBytes,
  failedSessionRecord,
  invocationSummariesOf,
  operationOutputType,
  operationsOf,
  runFinalAssemblyStep,
  sumCosts,
  elapsedMs,
  type SessionRecordBaseInput,
} from "./editing-session-support.js";
import {
  editableSourceArtifacts,
  validateEditingSessionGate,
} from "./editing-validation.js";

/** Options of {@link createEditingCompositionRuntime}. */
export interface EditingCompositionRuntimeOptions {
  /** The production package's pawn lifecycle + execution surface (the W7-B Editor Pawn composes through it). */
  readonly pawnExecution: PawnExecutionPort;
  /** The studio-side artifact factory (intermediates versioned through it, CORE-004 discipline). */
  readonly artifactFactory: StudioArtifactFactoryPort;
  /** The §15 consent gate port (REAL rights authority behind it at the composition seam). */
  readonly participantConsentPort: ParticipantConsentPort;
  readonly now: () => Timestamp;
  /** Editing session id factory. */
  readonly editingSessionIdFactory: () => EditingSessionId;
  /** New package id factory (the intermediates source). */
  readonly packageIdFactory: () => StudioArtifactPackageId;
  /** Edit graph id factory. */
  readonly graphIdFactory: () => EditGraphId;
}

/** Creates the EditingCompositionPort implementation. */
export function createEditingCompositionRuntime(
  options: EditingCompositionRuntimeOptions,
): EditingCompositionPort & {
  /** The composed editor pawn binding (inspection + the disclosed composition surface). */
  readonly editorBinding: ReturnType<typeof createEditorPawnBinding>;
  /** The graph store (inspection). */
  readonly graphStore: EditingGraphStore;
} {
  const editorBinding = createEditorPawnBinding({ pawnExecution: options.pawnExecution });
  const graphStore: EditingGraphStore = createEditingGraphStore({
    graphIdFactory: options.graphIdFactory,
    now: options.now,
  });
  /** tenantId → append-only editing session log. */
  const sessionsByTenant = new Map<string, EditingSessionRecord[]>();
  /** tenantId → packageId → latest version assigned by an editing session. */
  const packageVersionIndex = new Map<string, Map<string, ContractVersion>>();

  function sessionLog(scope: TenantScope): EditingSessionRecord[] {
    return sessionsByTenant.get(String(scope.tenantId)) ?? [];
  }

  function appendSession(scope: TenantScope, record: EditingSessionRecord): void {
    const key = String(scope.tenantId);
    const log = sessionsByTenant.get(key) ?? [];
    log.push(record);
    sessionsByTenant.set(key, log);
  }

  function rememberPackageVersion(
    scope: TenantScope,
    packageId: StudioArtifactPackageId,
    version: ContractVersion,
  ): void {
    const key = String(scope.tenantId);
    let byTenant = packageVersionIndex.get(key);
    if (byTenant === undefined) {
      byTenant = new Map<string, ContractVersion>();
      packageVersionIndex.set(key, byTenant);
    }
    const latest = byTenant.get(String(packageId)) ?? 0;
    if (version > latest) {
      byTenant.set(String(packageId), version);
    }
  }

  function latestAssignedPackageVersion(
    scope: TenantScope,
    packageId: StudioArtifactPackageId,
  ): ContractVersion {
    return packageVersionIndex.get(String(scope.tenantId))?.get(String(packageId)) ?? 0;
  }

  async function runEditingSession(
    scope: TenantScope,
    input: EditingSessionInput,
  ): Promise<EditingSessionOutcome> {
    const startedAt = options.now();
    // ---- Phase 1: validation + the §15 consent gate (typed failures; NO session record) ----
    const gateFailure = await validateEditingSessionGate(scope, input, options.participantConsentPort);
    if (gateFailure !== null) {
      return { ok: false, failure: gateFailure, record: null };
    }
    const sourceSessionRef =
      input.source.kind === "package" ? input.source.artifactPackage.sessionRef : input.source.sessionRef;
    const contributors = input.contributors ?? [];

    // ---- Phase 2: compose the W7-B Editor Pawn (deterministic, NO binding) ----
    const editingSessionId = options.editingSessionIdFactory();
    let editorInstance: PawnInstanceRecord;
    try {
      editorInstance = editorBinding.instantiateEditor(scope);
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "editor-pawn-instantiation-failed",
          reason: error instanceof Error ? error.message : String(error),
        },
        record: null,
      };
    }
    const editorCitation: EditorPawnCitation = {
      instanceId: String(editorInstance.instanceId),
      bodyId: String(editorInstance.bodyId),
      bodyVersion: Number(editorInstance.bodyVersion),
      pawnKind: "editor",
    };
    const engineInvocations: EditingSessionRecord["engineInvocations"][number][] = [];
    const recordedOperations: RecordedCompositionOperation[] = [];
    const operationOutputs: StudioArtifactRef[] = [];
    const consumedArtifactIds = [
      ...new Set(editableSourceArtifacts(input.source).map((artifact) => String(artifact.artifactId))),
    ];
    const recordBase: SessionRecordBaseInput = {
      editingSessionId,
      tenantId: scope.tenantId,
      actor: input.actor,
      organization: input.organization,
      formatId: input.formatPlugin.id,
      source: {
        packageId: input.source.kind === "package" ? input.source.artifactPackage.id : null,
        packageVersion: input.source.kind === "package" ? input.source.artifactPackage.version : null,
        sessionRef: sourceSessionRef,
      },
      editorPawn: editorCitation,
      engineInvocations,
      startedAt,
      artifactIds: consumedArtifactIds,
      provenance: { transformApplication: input.transformApplication, seed: input.seed },
    };

    const failedAndRecord = (
      failure: EditingCompositionFailure,
    ): EditingSessionOutcome => {
      const record = failedSessionRecord(recordBase, failure, options.now());
      tryReleaseEditor(scope, editorInstance.instanceId as PawnInstanceId);
      appendSession(scope, record);
      return { ok: false, failure, record };
    };

    function tryReleaseEditor(scopeRef: TenantScope, instanceId: PawnInstanceId): void {
      try {
        editorBinding.releaseEditor(scopeRef, instanceId);
      } catch {
        // release is best-effort on the error path; the §30 record stands.
      }
    }

    /** One composition step through the editor pawn. */
    async function composeStep(
      operationId: string,
      kind: CompositionOperationDeclaration["kind"] | "assemble",
      parameters: Record<string, unknown>,
      inputRefs: readonly StudioArtifactRef[],
    ): Promise<EditorCompositionRun> {
      return editorBinding.runComposition(
        {
          scope,
          organization: input.organization,
          actor: input.actor,
          transformApplication: input.transformApplication,
          seed: input.seed,
          engineResourceLimits: input.engineResourceLimits,
          engineOutputContract: input.engineOutputContract,
          operationId,
          kind,
          parameters,
          inputArtifactRefs: inputRefs,
        },
        editorInstance.instanceId as PawnInstanceId,
      );
    }

    // ---- Phase 3: execute the declared composition operations ----
    try {
      for (const { choice, operation } of operationsOf(input.choices)) {
        const run = await composeStep(
          operation.operationId,
          operation.kind,
          { ...operation.parameters },
          operation.inputArtifactRefs,
        );
        engineInvocations.push(...invocationSummariesOf(run));
        if (run.record.lifecycle !== "succeeded") {
          return failedAndRecord({
            kind: "editor-pawn-composition-failed",
            operationId: operation.operationId,
            failure: executionFailureDetailOf(run.record),
          });
        }
        const firstInput = operation.inputArtifactRefs[0];
        const creation = await options.artifactFactory.createArtifact({
          tenantId: scope.tenantId,
          type: operationOutputType(operation, run, "timeline"),
          stage: "intermediate",
          creationMethod: "composition",
          storageRef: `mos-studio:composition:${String(editingSessionId)}:${operation.operationId}` as StudioArtifactRef["storageRef"],
          content: compositionManifestBytes({
            compositionStep: operation.operationId,
            editKind: operation.kind,
            parameters: operation.parameters,
            inputs: operation.inputArtifactRefs.map((ref) => ({
              artifactId: String(ref.artifactId),
              version: Number(ref.version),
            })),
            engineInvocations: run.record.engineInvocations.map((invocation) => ({
              jobId: String(invocation.jobId),
              engineId: String(invocation.engineId),
              engineVersion: Number(invocation.engineVersion),
            })),
          }),
          rightsRef: (firstInput?.rightsRef ?? "mos-studio:editing:inherited") as StudioArtifactRef["rightsRef"],
          provenanceRef: `mos-studio:composition-provenance:${String(editingSessionId)}:${operation.operationId}` as StudioArtifactRef["provenanceRef"],
          parents: [...operation.inputArtifactRefs],
        });
        if (!creation.ok) {
          return failedAndRecord({
            kind: "intermediate-versioning-failed",
            operationId: operation.operationId,
            reason: JSON.stringify(creation.error),
          });
        }
        recordedOperations.push(
          Object.freeze({
            operationId: operation.operationId,
            kind: operation.kind,
            decisionPointId: choice.decisionPointId,
            choiceId: choice.choiceId,
            parameters: Object.freeze({ ...operation.parameters }),
            inputArtifactRefs: Object.freeze([...operation.inputArtifactRefs]),
            outputArtifactRefs: Object.freeze([creation.artifact]),
            engineInvocations: Object.freeze(invocationSummariesOf(run)),
            executedAt: options.now(),
          }),
        );
        operationOutputs.push(creation.artifact);
        consumedArtifactIds.push(String(creation.artifact.artifactId));
      }

      // ---- Phase 4: the final assembly (the editor pawn's §9 core duty) ----
      let finalArtifact: StudioArtifactRef | null = null;
      if (operationOutputs.length > 0) {
        const assembly = await runFinalAssemblyStep({
          composeStep: (operationId, kind, parameters, inputRefs) =>
            composeStep(operationId, kind, parameters, inputRefs),
          artifactFactory: options.artifactFactory,
          scope,
          editingSessionId: String(editingSessionId),
          operationOutputs: [...operationOutputs],
        });
        engineInvocations.push(...assembly.invocations);
        if (!assembly.ok) {
          return failedAndRecord(assembly.failure);
        }
        finalArtifact = assembly.finalArtifact;
        consumedArtifactIds.push(String(assembly.finalArtifact.artifactId));
      }

      // ---- Phase 5: record the edit graph (the org decides; the studio records) ----
      const graph = graphStore.recordSessionGraph(scope, {
        editingSessionId,
        tenantId: scope.tenantId,
        formatId: input.formatPlugin.id,
        declaredPointIds: (input.formatPlugin.organizationDecisionPoints ?? []).map((point) => point.pointId),
        choices: Object.freeze(
          input.choices.map(
            (choice): RecordedEditChoice =>
              Object.freeze({
                choiceId: choice.choiceId,
                decisionPointId: choice.decisionPointId,
                selectedOption: choice.selectedOption,
                decidedByOrganization: Object.freeze({ ...input.organization }) as StudioOrganizationRef,
                decidedAt: choice.decidedAt,
                operationIds: Object.freeze(choice.operations.map((operation) => operation.operationId)),
              }),
          ),
        ),
        operations: Object.freeze(recordedOperations),
        otioInterchange: false,
        origin: Object.freeze({ kind: "editing-session", editingSessionId }),
        recordedAt: options.now(),
      });

      // ---- Phase 6: the new immutable package version (treatment-versioned) ----
      const completedAt = options.now();
      const cost = sumCosts(engineInvocations.map((invocation) => invocation.cost));
      const sourcePackage = input.source.kind === "package" ? input.source.artifactPackage : null;
      const newPackageId = sourcePackage ? sourcePackage.id : options.packageIdFactory();
      const newPackage = assembleNewPackageVersion({
        source: input.source,
        scope,
        operationOutputs,
        finalArtifact,
        graph,
        newPackageId,
        latestAssignedVersion: latestAssignedPackageVersion(scope, newPackageId),
        completedAt,
        startedAt,
        cost,
        contributors,
      });
      rememberPackageVersion(scope, newPackage.id, newPackage.version);

      // ---- Phase 7: the §30 session record + pawn release ----
      const record: EditingSessionRecord = {
        ...recordBase,
        contractVersion: "editing-session/1",
        engineInvocations: Object.freeze([...engineInvocations]),
        resultPackage: { packageId: newPackage.id, version: newPackage.version },
        editGraph: { graphId: graph.graphId, version: graph.version },
        lifecycle: "succeeded",
        failure: null,
        cost,
        durationMs: elapsedMs(startedAt, completedAt),
        completedAt,
        artifactIds: Object.freeze([...consumedArtifactIds]),
      };
      editorBinding.releaseEditor(scope, editorInstance.instanceId as PawnInstanceId);
      appendSession(scope, record);
      const result: EditingSessionResult = { editingSessionId, newPackage, editGraph: graph, record };
      return { ok: true, result };
    } catch (error) {
      // Production's pawn execution THROWS typed caller errors (no record on
      // its side); the composing HAD started here, so the failure is
      // surfaced verbatim on a RECORDED failed session.
      const failure: EditingCompositionFailure = {
        kind: "editor-pawn-composition-failed",
        operationId: FINAL_ASSEMBLY_OPERATION_ID,
        failure: {
          code:
            error instanceof Error && "code" in error
              ? String((error as { code: unknown }).code)
              : "editing-composition-error",
          message: error instanceof Error ? error.message : String(error),
          retriable: false,
          detail: null,
        },
      };
      return failedAndRecord(failure);
    }
  }

  return {
    editorBinding,
    graphStore,

    async runEditingSession(scope, input) {
      return runEditingSession(scope, input);
    },

    getEditingSession(scope, editingSessionId) {
      return sessionLog(scope).find((record) => record.editingSessionId === editingSessionId);
    },

    listEditingSessions(scope, filter) {
      const log = sessionLog(scope);
      return log.filter(
        (record) => filter?.packageId === undefined || record.resultPackage?.packageId === filter.packageId,
      );
    },

    getEditGraph(scope, graphId, version) {
      return graphStore.get(scope, graphId, version);
    },

    listEditGraphVersions(scope, graphId) {
      return graphStore.listVersions(scope, graphId);
    },

    exportEditGraph(scope, graphId, version) {
      return graphStore.exportGraph(scope, graphId, version);
    },

    importEditGraph(scope, exported): EditGraphImportOutcome {
      return graphStore.importGraph(scope, exported);
    },

    compareEditGraphs(scope, graphA: EditGraphVersionRef, graphB: EditGraphVersionRef) {
      return compareEditGraphVersions(graphStore, options.now, scope, graphA, graphB);
    },
  };
}

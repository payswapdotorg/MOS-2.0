/**
 * The W7-B Editor Pawn binding (STUDIO-008) — composed via the production
 * package's surfaces (a registry-listed studio dependency since W7-B:
 * studio deps are [contracts, content, production, agents, capabilities,
 * engines, jobs, rights]).
 *
 * The EDITOR PAWN (architecture §9, LAB-013) is the org's editing
 * executor: a DETERMINISTIC transform pawn (remix/compilation/hybrid —
 * capability `render_timeline`, tool `engine:timeline-renderer`) that
 * assembles the declared edit decisions into a timeline and submits
 * render EngineJobs THROUGH THE RUNNER SEAM. This module composes it:
 * one instantiation per editing session (`instantiatePawn({ pawnKind:
 * "editor" })` — NO model binding: the pawn is deterministic and lock
 * rule 9's single model boundary is never asked), then one pawn execution
 * per composition operation plus one final assembly execution.
 *
 * The engine invocations flow inside the pawn execution through the
 * engines runner seam the composition root binds behind production's
 * PawnEngineRunnerPort (typed failures pass through VERBATIM into the §30
 * pawn execution record — surfaced unchanged by this binding).
 */

import type {
  JsonObject,
  JsonSchemaObject,
  ResourceLimits,
  TenantScope,
  Version,
} from "@mos/contracts";
import type {
  PawnExecutionActor,
  PawnExecutionPort,
  PawnExecutionRecord,
  PawnInstanceId,
  PawnInstanceRecord,
  TransformApplicationCitation,
} from "@mos/production";

import type { EditCompositionKind, EditingExecutionFailureDetail } from "../../contracts/editing-composition.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type { ContractVersion } from "../../contracts/refs.js";

/** The §9 pawn kind this binding composes (the W7-B Editor Pawn). */
export const EDITOR_PAWN_KIND = "editor" as const;

/** One composition run request handed to the editor pawn. */
export interface EditorCompositionRequest {
  readonly scope: TenantScope;
  /** The org citation (resolved fail-closed inside the pawn execution). */
  readonly organization: StudioOrganizationRef;
  readonly actor: PawnExecutionActor;
  readonly transformApplication: TransformApplicationCitation;
  readonly seed: number;
  readonly engineResourceLimits: ResourceLimits;
  readonly engineOutputContract?: JsonSchemaObject;
  /** Which composition step this run applies (an operation id, or `FINAL_ASSEMBLY_OPERATION_ID`). */
  readonly operationId: string;
  readonly kind: EditCompositionKind | "assemble";
  readonly parameters: JsonObject;
  readonly inputArtifactRefs: readonly StudioArtifactRef[];
}

/** One composition run: the pawn instance citation + the §30 execution record. */
export interface EditorCompositionRun {
  readonly instanceId: PawnInstanceId;
  readonly record: PawnExecutionRecord;
}

/** Options of {@link createEditorPawnBinding}. */
export interface EditorPawnBindingOptions {
  /** The production package's pawn lifecycle + execution surface (W7-B). */
  readonly pawnExecution: PawnExecutionPort;
}

/** The id of the final assembly step (not an edit kind — the timeline assembly). */
export const FINAL_ASSEMBLY_OPERATION_ID = "final-assembly" as const;

/** The verbatim typed-failure projection of a pawn execution record. */
export function executionFailureDetailOf(
  record: PawnExecutionRecord,
): EditingExecutionFailureDetail | null {
  const failure = record.failure;
  if (failure === null || failure === undefined) {
    return null;
  }
  return {
    code: String(failure.code),
    message: String(failure.message),
    retriable: failure.retriable === true,
    detail: failure.detail ?? null,
  };
}

/**
 * Composes the W7-B Editor Pawn through the production package's surfaces:
 * instantiates the deterministic editor pawn (NO model binding — the
 * no-model-selection pin extends to this binding) and executes composition
 * tasks as declared TransformPawnTasks whose engine invocations run
 * through the runner seam.
 */
export function createEditorPawnBinding(options: EditorPawnBindingOptions): {
  /** Instantiates the editor pawn for one editing session (deterministic, unbound). */
  instantiateEditor(scope: TenantScope): PawnInstanceRecord;
  /** Executes one composition step through the editor pawn. */
  runComposition(request: EditorCompositionRequest, instanceId: PawnInstanceId): Promise<EditorCompositionRun>;
  /** Releases the editor pawn instance (terminal). */
  releaseEditor(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord;
} {
  return {
    instantiateEditor(scope: TenantScope): PawnInstanceRecord {
      return options.pawnExecution.instantiatePawn(scope, { pawnKind: EDITOR_PAWN_KIND });
    },

    async runComposition(
      request: EditorCompositionRequest,
      instanceId: PawnInstanceId,
    ): Promise<EditorCompositionRun> {
      // The canonical branded Version of the org citation: studio
      // ContractVersion is the plain monotonic counter (documented studio
      // extension) — the single documented cast point of this binding.
      const organizationVersion = pawnOrganizationVersionOf(request.organization.version);
      const record = await options.pawnExecution.executePawn(request.scope, {
        instanceId,
        transformApplication: request.transformApplication,
        inputArtifactRefs: request.inputArtifactRefs,
        parameters: {
          compositionStep: request.operationId,
          editKind: request.kind,
          ...request.parameters,
        },
        seed: request.seed,
        actor: request.actor,
        organization: {
          organizationId: request.organization.id,
          version: organizationVersion,
        },
        engineResourceLimits: request.engineResourceLimits,
        engineOutputContract: request.engineOutputContract,
      });
      return { instanceId, record };
    },

    releaseEditor(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord {
      return options.pawnExecution.releasePawn(scope, instanceId);
    },
  };
}

/** Studio org version → canonical branded Version (documented cast point for pawn citations). */
export function pawnOrganizationVersionOf(version: ContractVersion): Version {
  return version as Version;
}

/**
 * AI editing / composition contracts (STUDIO-008).
 *
 * The editing SESSION: a packaged artifact (or intermediate artifacts) plus
 * an organization — whose Editor Pawn / §16-style edit decision points
 * drive the choices (THE ORG DECIDES, THE STUDIO RECORDS) — produce a NEW
 * IMMUTABLE VERSION of the artifact package (treatment-versioned like the
 * W3-C discipline: predecessors are never mutated, §19) with a recorded
 * edit graph (declared decision points from the format plugin, org-supplied
 * choices at those points, every choice recorded with provenance).
 *
 * Basis: spec/mos-architecture-v2.0.md §13 (one runtime, pluggable formats;
 * two entry modes), §16 (production-program variables — layout/timing/edit
 * choices are ORGANIZATION decisions, never universal studio hard-codes),
 * §9 (the Editor Pawn is one of the ten transform pawn agents — composed
 * here through the production package's surfaces, the registry-listed
 * studio dependency since W7-B), §12 (editorial interoperability — editing
 * decisions and edit graphs are interoperable records, see
 * edit-graph-interop.ts), §6 (immutable lineage on every new artifact
 * version), §15/§27 (multi-account consent gates before processing), §19
 * (every treatment creates a new immutable linked version), §30
 * (observability of every studio production action), §31 (tenant scoping).
 *
 * Composition operations are DECLARED closed-vocabulary edit kinds
 * (cut/trim/reorder/overlay/caption/dub-track/scale — aligned with the
 * frozen §5 transform kinds where applicable). The deterministic edit
 * operations execute through the W7-B Editor Pawn, whose engine
 * invocations are EngineJobs through the engines runner seam (typed
 * failures pass through verbatim; §30 records).
 */

import type {
  ConsentRef,
  ContractVersion,
  EditGraphId,
  EditingSessionId,
  IdentityRef,
  StudioArtifactPackageId,
  StudioFormatId,
  StudioSessionId,
  TenantId,
  Timestamp,
} from "./refs.js";
import type {
  EditGraphRef,
  StudioArtifactPackage,
  StudioArtifactRef,
} from "./studio-artifact-package.js";
import type { StudioFormatPlugin } from "./studio-format.js";
import type { StudioOrganizationRef } from "./organization-loading.js";
import type {
  ArtifactRef,
  JsonObject,
  JsonSchemaObject,
  MoneyAmount,
  ResourceLimits,
} from "@mos/contracts";
import type {
  PawnExecutionActor,
  PawnExecutionRecord,
  PawnTransformKind,
  TransformApplicationCitation,
  TransformPawnKind,
} from "@mos/production";

// ---------------------------------------------------------------------------
// The closed edit-kind vocabulary (§12/§16 composition operations)
// ---------------------------------------------------------------------------

/**
 * The declared closed vocabulary of composition edit kinds (STUDIO-008).
 * Anything outside this union is a typed failure (`unknown-edit-kind`) —
 * there is no open-ended edit surface.
 */
export type EditCompositionKind =
  | "cut"
  | "trim"
  | "reorder"
  | "overlay"
  | "caption"
  | "dub-track"
  | "scale";

/** The closed vocabulary in declaration order (frozen). */
export const EDIT_COMPOSITION_KINDS: readonly EditCompositionKind[] = Object.freeze([
  "cut",
  "trim",
  "reorder",
  "overlay",
  "caption",
  "dub-track",
  "scale",
] as const);

/**
 * The DECLARED alignment of each edit kind with the frozen §5 transform
 * kinds (data, pinned by tests): which transform kinds an edit kind
 * implements when composed. The production-side projection of the thirteen
 * kinds (`PawnTransformKind` from `@mos/production`) is the type — the
 * alignment never re-declares the transform vocabulary.
 */
function alignedKinds(...kinds: PawnTransformKind[]): readonly PawnTransformKind[] {
  return Object.freeze([...kinds]);
}

export const EDIT_KIND_TRANSFORM_ALIGNMENT: Readonly<
  Record<EditCompositionKind, readonly PawnTransformKind[]>
> = Object.freeze({
  cut: alignedKinds("clip"),
  trim: alignedKinds("clip"),
  reorder: alignedKinds("remix", "compilation"),
  overlay: alignedKinds("reaction", "hybrid"),
  caption: alignedKinds("voiceover", "hybrid"),
  "dub-track": alignedKinds("translation-dubbing"),
  scale: alignedKinds("crop-reframe"),
});

// ---------------------------------------------------------------------------
// Organization edit choices (the org decides; the studio records)
// ---------------------------------------------------------------------------

/**
 * One declared composition operation: a closed-vocabulary edit kind with
 * declared inputs (artifact refs — media bytes never travel over the
 * control plane), declared parameters, and (after execution) recorded
 * output artifact refs. Intermediates are versioned through the studio
 * ArtifactFactoryPort (CORE-004 discipline).
 */
export interface CompositionOperationDeclaration {
  /** Stable id of the operation inside one editing session (non-blank, unique). */
  readonly operationId: string;
  /** The declared edit kind (closed vocabulary). */
  readonly kind: EditCompositionKind;
  /** Declared input artifact refs (non-empty; must resolve in the source). */
  readonly inputArtifactRefs: readonly StudioArtifactRef[];
  /** Declared parameters of the edit (opaque JSON object). */
  readonly parameters: JsonObject;
}

/**
 * The organization's choice at one declared edit decision point (§16-style:
 * the ORG decides, the studio records). The choice carries the org's
 * selected option (recorded verbatim as data) and the composition
 * operations that implement it.
 */
export interface OrganizationEditChoice {
  /** Stable id of the choice inside one editing session (non-blank, unique). */
  readonly choiceId: string;
  /** MUST reference an edit decision point the format plugin declares. */
  readonly decisionPointId: string;
  /** The org's selected option label — recorded verbatim, never re-interpreted. */
  readonly selectedOption: string;
  /** The composition operations implementing the choice (may be empty: a no-change decision). */
  readonly operations: readonly CompositionOperationDeclaration[];
  readonly decidedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The editing session input
// ---------------------------------------------------------------------------

/**
 * What an editing session edits: either a packaged artifact (the session's
 * output package — the session then produces a NEW VERSION of the same
 * package id, treatment-versioned) or intermediate artifacts of a session
 * (the session then produces a NEW package for those intermediates).
 */
export type EditingSourceInput =
  | { readonly kind: "package"; readonly artifactPackage: StudioArtifactPackage }
  | {
      readonly kind: "intermediates";
      readonly sessionRef: StudioSessionId;
      readonly intermediates: readonly StudioArtifactRef[];
    };

/** One contributing participant of the source (§15 multi-account consent gate input). */
export interface EditingContributor {
  readonly participantIdentityRef: IdentityRef;
  /** The consent refs covering this contributor's contributions. */
  readonly consentRefs: readonly ConsentRef[];
}

/** Input of {@link ../ports/editing-composition.port.js!EditingCompositionPort.runEditingSession}. */
export interface EditingSessionInput {
  /** The format whose declared organization decision points constrain the choices (§16). */
  readonly formatPlugin: StudioFormatPlugin;
  /** The packaged artifact (or intermediates) being edited. */
  readonly source: EditingSourceInput;
  /** The organization whose Editor Pawn drives the editing (provenance + citation). */
  readonly organization: StudioOrganizationRef;
  /** The organization's choices at the declared edit decision points (the org decides). */
  readonly choices: readonly OrganizationEditChoice[];
  /** §30 actor — also the rights grantee of every pawn execution. */
  readonly actor: PawnExecutionActor;
  /** Determinism seed of the deterministic edit operations (required, finite). */
  readonly seed: number;
  /** The transform application the editing composes (exact version; the editor pawn serves its kind). */
  readonly transformApplication: TransformApplicationCitation;
  /** Explicit engine resource grant — REQUIRED (§11: no implicit quotas for engine invocations). */
  readonly engineResourceLimits: ResourceLimits;
  /** Contributors whose raw captures the source carries (§15 consent gate; required when raw artifacts exist). */
  readonly contributors?: readonly EditingContributor[];
  /** Output contract carried on submitted EngineJobs (defaults to `{ type: "object" }`). */
  readonly engineOutputContract?: JsonSchemaObject;
}

// ---------------------------------------------------------------------------
// §30 engine-invocation summaries (typed failures pass through)
// ---------------------------------------------------------------------------

/**
 * The §30 summary of one engine invocation recorded by an editing session:
 * exact engine/capability identity, lifecycle, typed failure (verbatim
 * code/message when failed), latency, cost and the engine-side output
 * refs. Source: the Editor Pawn execution record's engine invocations.
 */
export interface EditingEngineInvocationSummary {
  /** The pawn execution that submitted the EngineJob. */
  readonly executionId: string;
  readonly jobId: string;
  readonly engineId: string;
  readonly engineVersion: number;
  readonly capabilityId: string;
  readonly capabilityVersion: number;
  readonly lifecycle: "succeeded" | "failed";
  /** Verbatim typed failure code, or `null` on success. */
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly durationMs: number;
  readonly cost: MoneyAmount;
  /** Engine-side output artifact refs (execution evidence, distinct from studio-side versions). */
  readonly outputArtifactRefs: readonly ArtifactRef[];
}

// ---------------------------------------------------------------------------
// The recorded edit graph
// ---------------------------------------------------------------------------

/** One org choice as RECORDED by the studio (org decides; studio records). */
export interface RecordedEditChoice {
  readonly choiceId: string;
  readonly decisionPointId: string;
  readonly selectedOption: string;
  readonly decidedByOrganization: StudioOrganizationRef;
  readonly decidedAt: Timestamp;
  /** The composition operations implementing the choice, in recorded order. */
  readonly operationIds: readonly string[];
}

/** One composition operation as RECORDED after execution. */
export interface RecordedCompositionOperation {
  readonly operationId: string;
  readonly kind: EditCompositionKind;
  /** The declared decision point (and choice) the operation answers. */
  readonly decisionPointId: string;
  readonly choiceId: string;
  readonly parameters: JsonObject;
  readonly inputArtifactRefs: readonly StudioArtifactRef[];
  /** The NEW immutable studio-side output versions (lineage-closed, §6). */
  readonly outputArtifactRefs: readonly StudioArtifactRef[];
  readonly engineInvocations: readonly EditingEngineInvocationSummary[];
  readonly executedAt: Timestamp;
}

/** Where a graph version came from. */
export type EditGraphOrigin =
  | { readonly kind: "editing-session"; readonly editingSessionId: EditingSessionId }
  | { readonly kind: "imported-interchange"; readonly sourceVersion: ContractVersion };

/**
 * The composition edit graph of an editing session: the org-supplied
 * choices at the format's declared decision points plus the recorded
 * composition operations, versioned and append-only. Interoperable per §12
 * (export/import in edit-graph-interop.ts). The ORG decides; this record
 * is the studio's faithful recording of those decisions with full
 * provenance.
 */
export interface EditingCompositionGraph {
  readonly graphId: EditGraphId;
  readonly version: ContractVersion;
  /** The editing session that produced this graph (`null` for a graph version created by import without a session). */
  readonly editingSessionId: EditingSessionId | null;
  readonly tenantId: TenantId;
  readonly formatId: StudioFormatId;
  /** The decision points the format declared when the graph was recorded. */
  readonly declaredPointIds: readonly string[];
  readonly choices: readonly RecordedEditChoice[];
  readonly operations: readonly RecordedCompositionOperation[];
  /** Whether an OpenTimelineIO interchange export exists (§12: interchange layer, never authority). */
  readonly otioInterchange: boolean;
  readonly origin: EditGraphOrigin;
  readonly recordedAt: Timestamp;
}

/** Reference to one exact edit-graph version. */
export interface EditGraphVersionRef {
  readonly graphId: EditGraphId;
  readonly version: ContractVersion;
}

/** Reference carried by the new package version's `editGraphRef`. */
export type { EditGraphRef };

// ---------------------------------------------------------------------------
// The §30 editing session record
// ---------------------------------------------------------------------------

/** The Editor Pawn citation recorded on the §30 session record. */
export interface EditorPawnCitation {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: number;
  readonly pawnKind: TransformPawnKind;
}

/**
 * The §30 record of one editing session: session identity, contract
 * version, actor, organization version, the editor pawn citation, every
 * engine invocation (exact engine/capability versions, artifact refs,
 * cost/latency, typed failures), the package versions consumed/produced,
 * the edit graph, failure/warnings and provenance.
 */
export interface EditingSessionRecord {
  readonly editingSessionId: EditingSessionId;
  readonly contractVersion: "editing-session/1";
  readonly tenantId: TenantId;
  readonly actor: PawnExecutionActor;
  readonly organization: StudioOrganizationRef;
  readonly formatId: StudioFormatId;
  /** The exact source consumed: package id/version when packaged, or the cited session. */
  readonly source: {
    readonly packageId: StudioArtifactPackageId | null;
    readonly packageVersion: ContractVersion | null;
    readonly sessionRef: StudioSessionId;
  };
  /** The new immutable package version produced (null when the session failed before assembly). */
  readonly resultPackage: { readonly packageId: StudioArtifactPackageId; readonly version: ContractVersion } | null;
  readonly editGraph: EditGraphVersionRef | null;
  readonly editorPawn: EditorPawnCitation;
  readonly engineInvocations: readonly EditingEngineInvocationSummary[];
  readonly lifecycle: "succeeded" | "failed";
  /** The typed failure verbatim when failed; `null` on success. */
  readonly failure: EditingCompositionFailure | null;
  readonly cost: MoneyAmount;
  readonly durationMs: number;
  readonly startedAt: Timestamp;
  readonly completedAt: Timestamp;
  readonly provenance: {
    readonly transformApplication: TransformApplicationCitation;
    readonly seed: number;
  };
  /** Artifact ids consumed then produced (input echo + new versions). */
  readonly artifactIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Typed failures (never thrown for validation; recorded when composing)
// ---------------------------------------------------------------------------

/** The verbatim pawn/typed-engine failure shape passed through on execution failures. */
export interface EditingExecutionFailureDetail {
  readonly code: string;
  readonly message: string;
  readonly retriable: boolean;
  readonly detail: unknown;
}

/** Typed failures of the editing session (enumerated; no silent fallbacks). */
export type EditingCompositionFailure =
  | {
      readonly kind: "choice-point-not-declared";
      readonly decisionPointId: string;
      readonly declaredPointIds: readonly string[];
    }
  | { readonly kind: "edit-choice-malformed"; readonly choiceId: string; readonly reasons: readonly string[] }
  | {
      readonly kind: "unknown-edit-kind";
      readonly operationId: string;
      /** The rejected edit-kind value verbatim. */
      readonly editKind: string;
      readonly knownKinds: readonly EditCompositionKind[];
    }
  | { readonly kind: "operation-input-not-in-source"; readonly operationId: string; readonly artifactId: string }
  | { readonly kind: "cross-tenant-source"; readonly sourceTenantId: string; readonly scopeTenantId: string }
  | { readonly kind: "consent-contributors-required"; readonly rawArtifactCount: number }
  | { readonly kind: "consent-not-covering-processing"; readonly participantIdentityRef: string }
  | { readonly kind: "invalid-seed"; readonly seed: number }
  | { readonly kind: "invalid-engine-resource-limits"; readonly reason: string }
  | { readonly kind: "editor-pawn-instantiation-failed"; readonly reason: string }
  | {
      readonly kind: "editor-pawn-composition-failed";
      readonly operationId: string;
      /** The typed failure VERBATIM from the pawn execution record (engine failures included). */
      readonly failure: EditingExecutionFailureDetail | null;
    }
  | { readonly kind: "intermediate-versioning-failed"; readonly operationId: string; readonly reason: string }
  | { readonly kind: "final-assembly-failed"; readonly reason: string };

// ---------------------------------------------------------------------------
// The session result
// ---------------------------------------------------------------------------

/** Everything one successful editing session produced. */
export interface EditingSessionResult {
  readonly editingSessionId: EditingSessionId;
  /** The NEW immutable package version (predecessors stay resolvable, §19). */
  readonly newPackage: StudioArtifactPackage;
  /** The recorded edit graph (org-supplied choices + executed operations). */
  readonly editGraph: EditingCompositionGraph;
  /** The §30 session record. */
  readonly record: EditingSessionRecord;
}

/**
 * The outcome of one editing session. Validation failures (undeclared
 * points, unknown kinds, consent gates, tenant scoping) return `ok: false`
 * with `record: null` — no production action ran. Execution failures
 * (engine typed failures, versioning failures) carry the RECORDED §30
 * session record (the composing started; failures are auditable).
 */
export type EditingSessionOutcome =
  | { readonly ok: true; readonly result: EditingSessionResult }
  | {
      readonly ok: false;
      readonly failure: EditingCompositionFailure;
      readonly record: EditingSessionRecord | null;
    };

/** The pawn execution record type composed by the editing executor (§30 evidence). */
export type { PawnExecutionRecord, PawnExecutionActor, TransformApplicationCitation };

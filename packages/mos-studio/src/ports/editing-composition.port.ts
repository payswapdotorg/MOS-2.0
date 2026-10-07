/**
 * EditingCompositionPort (STUDIO-008) — the studio's editing/composition
 * surface.
 *
 * An editing SESSION takes a packaged artifact (or intermediate artifacts)
 * plus an organization — whose Editor Pawn / §16-style edit decision
 * points drive the choices (the ORG decides, the studio records) — and
 * produces a NEW IMMUTABLE VERSION of the artifact package
 * (treatment-versioned, §19) with a recorded edit graph. Deterministic
 * edit operations execute through the W7-B Editor Pawn composed via the
 * production package's surfaces (a registry-listed studio dependency since
 * W7-B); its engine invocations are EngineJobs through the engines runner
 * seam (typed failures pass through verbatim; §30 records).
 *
 * §12 editorial interoperability: edit graphs export/import through the
 * ONE declared interchange format (validated + versioned imports; no
 * silent lossy conversion) and compare structurally.
 *
 * 8 public methods (architecture policy budget: 12).
 *
 * THE STUDIO NEVER SELECTS MODELS (lock rule 9; the W3-C pin extends to
 * this surface — pinned by runtime/editing/editing-no-model-selection.test.ts):
 * the Editor Pawn is deterministic and is instantiated WITHOUT any model
 * binding; there is no model-selection vocabulary anywhere on this port.
 */

import type { TenantScope } from "@mos/contracts";

import type {
  EditGraphVersionRef,
  EditingCompositionGraph,
  EditingSessionInput,
  EditingSessionOutcome,
  EditingSessionRecord,
} from "../contracts/editing-composition.js";
import type {
  EditGraphComparison,
  EditGraphComparisonOutcome,
  EditGraphExport,
  EditGraphImportOutcome,
} from "../contracts/edit-graph-interop.js";
import type { StudioArtifactPackageId, EditingSessionId, EditGraphId, ContractVersion } from "../contracts/refs.js";

/** The studio's editing/composition surface. 8 public methods. */
export interface EditingCompositionPort {
  /**
   * Runs one editing session: validates the org's choices against the
   * format's declared edit decision points (undeclared points rejected),
   * gates multi-account sources on consent, composes the W7-B Editor Pawn
   * (deterministic — no model binding), executes the declared composition
   * operations with engine invocations through the runner seam (typed
   * failures pass through verbatim), versions the intermediates through
   * the studio ArtifactFactoryPort, and assembles the NEW immutable
   * package version with the recorded edit graph.
   */
  runEditingSession(scope: TenantScope, input: EditingSessionInput): Promise<EditingSessionOutcome>;

  /** One §30 editing session record, or `undefined` when unknown/foreign-tenant. */
  getEditingSession(scope: TenantScope, editingSessionId: EditingSessionId): EditingSessionRecord | undefined;

  /** The tenant-scoped append-only editing session log (ascending order). */
  listEditingSessions(
    scope: TenantScope,
    filter?: { readonly packageId?: StudioArtifactPackageId },
  ): readonly EditingSessionRecord[];

  /** One recorded edit graph version (exact version, or the latest when omitted), or `undefined`. */
  getEditGraph(
    scope: TenantScope,
    graphId: EditGraphId,
    version?: ContractVersion,
  ): EditingCompositionGraph | undefined;

  /** All recorded versions of one edit graph, ascending (append-only chain). */
  listEditGraphVersions(scope: TenantScope, graphId: EditGraphId): readonly EditingCompositionGraph[];

  /**
   * Exports one edit-graph version in the DECLARED interchange format
   * (§12): the complete record, nothing projected away.
   */
  exportEditGraph(
    scope: TenantScope,
    graphId: EditGraphId,
    version?: ContractVersion,
  ): { readonly ok: true; readonly export: EditGraphExport } | { readonly ok: false; readonly graphId: EditGraphId };

  /**
   * Imports a returned interchange record (§12): validates the format
   * identity, the tenant scope and the COMPLETE graph shape, then records
   * it as a NEW append-only version. No silent lossy conversion — an
   * invalid record fails with enumerated reasons.
   */
  importEditGraph(scope: TenantScope, exported: EditGraphExport): EditGraphImportOutcome;

  /**
   * Structurally compares two recorded edit-graph versions (comparable
   * shapes: the same interchange record shape on both sides).
   */
  compareEditGraphs(
    scope: TenantScope,
    graphA: EditGraphVersionRef,
    graphB: EditGraphVersionRef,
  ): EditGraphComparisonOutcome;
}

/** Re-exported comparison type for consumers of the port. */
export type { EditGraphComparison };

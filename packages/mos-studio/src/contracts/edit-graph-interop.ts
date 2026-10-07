/**
 * Edit-graph interoperability contracts (STUDIO-008, §12 Editorial
 * interoperability).
 *
 * Editing decisions and edit graphs are INTEROPERABLE RECORDS: the studio
 * declares ONE export format (`mos-edit-graph-interchange`, versioned) whose
 * payload is the COMPLETE graph record — external editors can consume it,
 * edit it, and return it; the studio import VALIDATES the returned record
 * and VERSIONS it (append-only) into the tenant's graph registry. There is
 * NO silent lossy conversion: the export carries the full graph verbatim,
 * and the import either records the whole validated record or fails with
 * enumerated reasons.
 *
 * OpenTimelineIO stays what §12 fixes it as: an interchange LAYER for
 * timeline/cut information that external tooling may map to — never the
 * MOS authority. The `otioInterchange` flag on the graph records whether
 * such a timeline interchange export exists; THIS format is the
 * MOS-declared edit-graph interchange shape.
 *
 * Tenant discipline (§31): an export names its source tenant; importing a
 * foreign tenant's export is a typed rejection (no sharing contract exists
 * for edit graphs).
 */

import type {
  ContractVersion,
  EditGraphId,
  EditingSessionId,
  TenantId,
} from "./refs.js";
import type {
  EditCompositionKind,
  EditGraphVersionRef,
  EditingCompositionGraph,
} from "./editing-composition.js";

// ---------------------------------------------------------------------------
// The declared export format
// ---------------------------------------------------------------------------

/** The declared edit-graph interchange format id (§12: ONE declared format). */
export const EDIT_GRAPH_INTERCHANGE_FORMAT = "mos-edit-graph-interchange" as const;

/** The current version of the declared interchange format. */
export const EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION = 1;

/**
 * The export envelope: the declared format identity plus the COMPLETE
 * graph record — every choice, every operation, every artifact ref, every
 * engine-invocation summary, the declared points, the origin. Nothing is
 * projected away.
 */
export interface EditGraphExport {
  readonly format: typeof EDIT_GRAPH_INTERCHANGE_FORMAT;
  readonly formatVersion: number;
  /** The tenant the graph was recorded in (import into another tenant is rejected, §31). */
  readonly tenantId: TenantId;
  /** The complete graph record, verbatim. */
  readonly graph: EditingCompositionGraph;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Typed import failures (enumerated; no silent partial imports). */
export type EditGraphImportError =
  | { readonly kind: "unknown-edit-graph-export-format"; readonly format: string }
  | { readonly kind: "unsupported-export-format-version"; readonly formatVersion: number }
  | { readonly kind: "edit-graph-foreign-tenant"; readonly exportTenantId: string }
  | { readonly kind: "edit-graph-import-invalid"; readonly reasons: readonly string[] };

/** The outcome of one import. */
export type EditGraphImportOutcome =
  | {
      readonly ok: true;
      /** The graph as recorded now (the imported payload, re-versioned). */
      readonly graph: EditingCompositionGraph;
      /** The version the import assigned (append-only versioning). */
      readonly importedAs: EditGraphVersionRef;
    }
  | { readonly ok: false; readonly error: EditGraphImportError };

// ---------------------------------------------------------------------------
// Comparison (exportable/comparable shapes)
// ---------------------------------------------------------------------------

/** One side of a per-point choice difference. */
export interface EditGraphChoiceSide {
  readonly choiceId: string;
  readonly selectedOption: string;
  readonly operationIds: readonly string[];
}

/** How the two graphs' choices differ at one decision point. */
export interface EditGraphChoiceDifference {
  readonly decisionPointId: string;
  readonly inA: EditGraphChoiceSide | null;
  readonly inB: EditGraphChoiceSide | null;
}

/**
 * The structured comparison of two edit-graph versions: shared and
 * graph-only declared points, per-point choice differences, and the
 * operation-kind histograms of each side. Comparable shapes = the SAME
 * record shape on both sides (any two versions of the interchange record
 * compare without conversion).
 */
export interface EditGraphComparison {
  readonly graphA: EditGraphVersionRef;
  readonly graphB: EditGraphVersionRef;
  /** Points both graph versions record choices at. */
  readonly sharedPointIds: readonly string[];
  readonly pointsOnlyInA: readonly string[];
  readonly pointsOnlyInB: readonly string[];
  readonly choiceDifferences: readonly EditGraphChoiceDifference[];
  /** Operation counts per edit kind, per side (the composition histogram). */
  readonly operationKindCountsA: Readonly<Record<EditCompositionKind, number>>;
  readonly operationKindCountsB: Readonly<Record<EditCompositionKind, number>>;
  readonly comparedAt: string;
}

/** The outcome of one comparison. */
export type EditGraphComparisonOutcome =
  | { readonly ok: true; readonly comparison: EditGraphComparison }
  | { readonly ok: false; readonly kind: "edit-graph-not-found"; readonly graphId: EditGraphId };

/** Re-exported for interchange-record construction at the seam. */
export type { EditingCompositionGraph, EditGraphVersionRef, EditingSessionId, ContractVersion };

/**
 * The tenant-scoped append-only edit-graph registry + the §12 interchange
 * operations (STUDIO-008).
 *
 * Graph versions are immutable and append-only under one graph id. The
 * DECLARED interchange format (`mos-edit-graph-interchange/1`) exports the
 * COMPLETE record and imports validate + re-version returned records —
 * there is NO silent lossy conversion (invalid records fail with
 * enumerated reasons; foreign-tenant exports are rejected, §31).
 */

import type {
  EditGraphId,
  Timestamp,
} from "../../contracts/refs.js";
import type {
  EditCompositionKind,
  EditGraphVersionRef,
  EditingCompositionGraph,
} from "../../contracts/editing-composition.js";
import { EDIT_COMPOSITION_KINDS } from "../../contracts/editing-composition.js";
import type {
  EditGraphExport,
  EditGraphImportError,
  EditGraphImportOutcome,
} from "../../contracts/edit-graph-interop.js";
import {
  EDIT_GRAPH_INTERCHANGE_FORMAT,
  EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION,
} from "../../contracts/edit-graph-interop.js";
import type { TenantScope } from "@mos/contracts";

/** Options of {@link createEditingGraphStore}. */
export interface EditingGraphStoreOptions {
  /** Graph id factory (one per recorded graph chain). */
  readonly graphIdFactory: () => EditGraphId;
  readonly now: () => Timestamp;
}

/** Structural validation of an interchange graph record (enumerated reasons). */
function graphRecordIssues(graph: unknown): string[] {
  const reasons: string[] = [];
  const record = graph as Partial<EditingCompositionGraph> | null | undefined;
  if (record === null || typeof record !== "object") {
    return ["graph must be an object"];
  }
  if (typeof record.graphId !== "string" || record.graphId.trim().length === 0) {
    reasons.push("graphId must be a non-blank string");
  }
  if (typeof record.version !== "number" || !Number.isFinite(record.version) || record.version < 1) {
    reasons.push("version must be a number ≥ 1");
  }
  if (typeof record.tenantId !== "string" || record.tenantId.trim().length === 0) {
    reasons.push("tenantId must be a non-blank string");
  }
  if (typeof record.formatId !== "string" || record.formatId.trim().length === 0) {
    reasons.push("formatId must be a non-blank string");
  }
  if (!Array.isArray(record.declaredPointIds)) {
    reasons.push("declaredPointIds must be an array");
  }
  if (typeof record.otioInterchange !== "boolean") {
    reasons.push("otioInterchange must be a boolean");
  }
  if (record.recordedAt === undefined) {
    reasons.push("recordedAt must be present");
  }
  if (
    record.origin === null ||
    typeof record.origin !== "object" ||
    (record.origin?.kind !== "editing-session" && record.origin?.kind !== "imported-interchange")
  ) {
    reasons.push("origin.kind must be 'editing-session' or 'imported-interchange'");
  }
  if (!Array.isArray(record.choices)) {
    reasons.push("choices must be an array");
    return reasons;
  }
  const choiceIds = new Set<string>();
  const pointIds = new Set<string>();
  for (const choice of record.choices) {
    if (typeof choice?.choiceId !== "string" || choice.choiceId.trim().length === 0) {
      reasons.push("every choice needs a non-blank choiceId");
      continue;
    }
    if (choiceIds.has(choice.choiceId)) {
      reasons.push(`choiceId ${choice.choiceId} appears more than once`);
    }
    choiceIds.add(choice.choiceId);
    if (typeof choice?.decisionPointId !== "string" || choice.decisionPointId.trim().length === 0) {
      reasons.push(`choice ${choice.choiceId} needs a non-blank decisionPointId`);
    } else if (pointIds.has(choice.decisionPointId)) {
      reasons.push(`decisionPointId ${choice.decisionPointId} is decided more than once`);
    } else {
      pointIds.add(choice.decisionPointId);
    }
    if (typeof choice?.selectedOption !== "string" || choice.selectedOption.trim().length === 0) {
      reasons.push(`choice ${choice.choiceId} needs a non-blank selectedOption`);
    }
    if (!Array.isArray(choice?.operationIds)) {
      reasons.push(`choice ${choice.choiceId} needs an operationIds array`);
    }
  }
  if (!Array.isArray(record.operations)) {
    reasons.push("operations must be an array");
    return reasons;
  }
  const operationIds = new Set<string>();
  for (const operation of record.operations) {
    if (typeof operation?.operationId !== "string" || operation.operationId.trim().length === 0) {
      reasons.push("every operation needs a non-blank operationId");
      continue;
    }
    if (operationIds.has(operation.operationId)) {
      reasons.push(`operationId ${operation.operationId} appears more than once`);
    }
    operationIds.add(operation.operationId);
    if (!EDIT_COMPOSITION_KINDS.includes(operation.kind)) {
      reasons.push(`operation ${operation.operationId} has an unknown edit kind ${String(operation.kind)}`);
    }
    if (typeof operation?.choiceId !== "string" || !choiceIds.has(operation.choiceId)) {
      reasons.push(`operation ${operation.operationId} must cite a recorded choiceId`);
    }
    if (typeof operation?.decisionPointId !== "string" || !pointIds.has(operation.decisionPointId)) {
      reasons.push(`operation ${operation.operationId} must cite a decided decisionPointId`);
    }
    if (!Array.isArray(operation?.inputArtifactRefs) || operation.inputArtifactRefs.length === 0) {
      reasons.push(`operation ${operation.operationId} needs a non-empty inputArtifactRefs array`);
    }
    if (!Array.isArray(operation?.outputArtifactRefs)) {
      reasons.push(`operation ${operation.operationId} needs an outputArtifactRefs array`);
    }
    if (
      operation?.parameters === null ||
      typeof operation?.parameters !== "object" ||
      Array.isArray(operation?.parameters)
    ) {
      reasons.push(`operation ${operation.operationId} needs object parameters`);
    }
    if (!Array.isArray(operation?.engineInvocations)) {
      reasons.push(`operation ${operation.operationId} needs an engineInvocations array`);
    }
    if (operation?.executedAt === undefined) {
      reasons.push(`operation ${operation.operationId} needs executedAt`);
    }
  }
  for (const choice of record.choices) {
    for (const operationId of choice?.operationIds ?? []) {
      if (typeof operationId === "string" && !operationIds.has(operationId)) {
        reasons.push(`choice ${choice.choiceId} cites unknown operationId ${String(operationId)}`);
      }
    }
  }
  return reasons;
}

/** The tenant-scoped append-only graph registry + interchange operations. */
export interface EditingGraphStore {
  /** Appends one graph version under its (new) chain id. Returns the recorded graph. */
  recordSessionGraph(
    scope: TenantScope,
    graph: Omit<EditingCompositionGraph, "graphId" | "version">,
  ): EditingCompositionGraph;
  /** One graph version (exact or latest), or `undefined`. */
  get(scope: TenantScope, graphId: EditGraphId, version?: number): EditingCompositionGraph | undefined;
  /** All versions of one chain, ascending. */
  listVersions(scope: TenantScope, graphId: EditGraphId): readonly EditingCompositionGraph[];
  /** Exports one version in the declared interchange format. */
  exportGraph(
    scope: TenantScope,
    graphId: EditGraphId,
    version?: number,
  ): { readonly ok: true; readonly export: EditGraphExport } | { readonly ok: false; readonly graphId: EditGraphId };
  /** Validates + re-versions one returned interchange record (§12). */
  importGraph(scope: TenantScope, exported: EditGraphExport): EditGraphImportOutcome;
}

/** Creates the tenant-scoped append-only graph registry + interchange ops. */
export function createEditingGraphStore(options: EditingGraphStoreOptions): EditingGraphStore {
  /** tenantId → graphId → versions ascending. */
  const chains = new Map<string, Map<string, EditingCompositionGraph[]>>();
  function chainOf(scope: TenantScope, graphId: EditGraphId): EditingCompositionGraph[] {
    return chains.get(String(scope.tenantId))?.get(String(graphId)) ?? [];
  }

  function append(scope: TenantScope, graphId: EditGraphId, graph: EditingCompositionGraph): void {
    const tenantKey = String(scope.tenantId);
    let byTenant = chains.get(tenantKey);
    if (byTenant === undefined) {
      byTenant = new Map<string, EditingCompositionGraph[]>();
      chains.set(tenantKey, byTenant);
    }
    let versions = byTenant.get(String(graphId));
    if (versions === undefined) {
      versions = [];
      byTenant.set(String(graphId), versions);
    }
    versions.push(graph);
  }

  function getGraph(scope: TenantScope, graphId: EditGraphId, version?: number): EditingCompositionGraph | undefined {
    const versions = chainOf(scope, graphId);
    if (versions.length === 0) return undefined;
    if (version === undefined) return versions[versions.length - 1];
    return versions.find((entry) => entry.version === version);
  }

  return {
    recordSessionGraph(scope, graph) {
      const graphId = options.graphIdFactory();
      const recorded: EditingCompositionGraph = Object.freeze({
        ...graph,
        graphId,
        version: 1,
        choices: Object.freeze([...graph.choices]),
        operations: Object.freeze([...graph.operations]),
        declaredPointIds: Object.freeze([...graph.declaredPointIds]),
      });
      append(scope, graphId, recorded);
      return recorded;
    },

    get(scope, graphId, version) {
      return getGraph(scope, graphId, version);
    },

    listVersions(scope, graphId) {
      return [...chainOf(scope, graphId)];
    },

    exportGraph(scope, graphId, version) {
      const graph = getGraph(scope, graphId, version);
      if (graph === undefined) {
        return { ok: false, graphId };
      }
      return {
        ok: true,
        export: Object.freeze({
          format: EDIT_GRAPH_INTERCHANGE_FORMAT,
          formatVersion: EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION,
          tenantId: scope.tenantId,
          graph,
        }),
      };
    },

    importGraph(scope, exported): EditGraphImportOutcome {
      if (
        exported === null ||
        typeof exported !== "object" ||
        (exported as { format?: unknown }).format !== EDIT_GRAPH_INTERCHANGE_FORMAT
      ) {
        const error: EditGraphImportError = {
          kind: "unknown-edit-graph-export-format",
          format: String((exported as { format?: unknown } | null)?.format ?? "absent"),
        };
        return { ok: false, error };
      }
      if (exported.formatVersion !== EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION) {
        return {
          ok: false,
          error: { kind: "unsupported-export-format-version", formatVersion: exported.formatVersion },
        };
      }
      if (String(exported.tenantId) !== String(scope.tenantId)) {
        return {
          ok: false,
          error: { kind: "edit-graph-foreign-tenant", exportTenantId: String(exported.tenantId) },
        };
      }
      const issues = graphRecordIssues(exported.graph);
      if (issues.length > 0) {
        return { ok: false, error: { kind: "edit-graph-import-invalid", reasons: issues } };
      }
      const source = exported.graph;
      const graphId = source.graphId;
      const versions = chainOf(scope, graphId);
      const assignedVersion = (versions[versions.length - 1]?.version ?? 0) + 1;
      // The imported record is preserved VERBATIM except the version chain
      // assignment + the import origin annotation (explicit versioning, no
      // silent lossy conversion — everything else is carried unchanged).
      const imported: EditingCompositionGraph = Object.freeze({
        ...source,
        version: assignedVersion,
        origin: Object.freeze({
          kind: "imported-interchange",
          sourceVersion: source.version,
        }),
        choices: Object.freeze([...source.choices]),
        operations: Object.freeze([...source.operations]),
        declaredPointIds: Object.freeze([...source.declaredPointIds]),
      });
      append(scope, graphId, imported);
      return { ok: true, graph: imported, importedAs: { graphId, version: assignedVersion } };
    },
  };
}

/** Operation-kind histogram of one graph version (the comparison projection). */
export function operationKindCountsOf(graph: EditingCompositionGraph): Readonly<Record<EditCompositionKind, number>> {
  const counts = {} as Record<EditCompositionKind, number>;
  for (const kind of EDIT_COMPOSITION_KINDS) {
    counts[kind] = 0;
  }
  for (const operation of graph.operations) {
    counts[operation.kind] += 1;
  }
  return counts;
}

/** The latest-version ref of a chain (helper for citations). */
export function latestVersionRef(graphId: EditGraphId, graph: EditingCompositionGraph): EditGraphVersionRef {
  return { graphId, version: graph.version };
}

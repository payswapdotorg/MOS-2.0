/**
 * DISCLOSED in-memory doubles of the BRIDGE-002 evaluation authority's
 * READ seams — deterministic, scriptable test seams for the in-package
 * evaluation battery's hostile probes.
 *
 * These are DOUBLES, never authorities: the REAL surfaces (the BRIDGE-001
 * bridge port over its append-only entry store, the STUDIO-013 canonical
 * packaging authority, the STUDIO-014 session directory) run in the
 * in-package fixtures (src/testing/evaluation-fixtures.ts) and the compat
 * battery (compat/evaluation-real-authorities.test.ts). The doubles below
 * exist for the failure shapes the REAL surfaces cannot produce from valid
 * fixture data — a packaged entry with a NULL expectations surface, a
 * missing session summary — plus call logging so tests can assert the
 * EXACT reads the authority emitted (gate ordering, no hidden surfaces).
 */

import type { StudioArtifactPackagingPort } from "../../../ports/artifact-packaging.port.js";
import type {
  StudioSessionDirectory,
  StudioSessionSummaryRecord,
} from "../../../ports/session-directory.port.js";
import type { StudioArtifactPackage } from "../../../contracts/studio-artifact-package.js";
import type { LabToStudioBridgePort } from "../../lab-to-studio-bridge.js";
import type { LabToStudioProductionEntry } from "../../contracts/lab-to-studio-entry.js";

// ---------------------------------------------------------------------------
// The packaging read double (scriptable resolvability + call log)
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryPackagingReads}. */
export interface InMemoryPackagingReadsOptions {
  /** The resolvable packages (per tenant, exact version). */
  readonly packages?: readonly {
    readonly tenantId: string;
    readonly package: StudioArtifactPackage;
  }[];
}

/** A packaging-authority READ double: exact-version resolution + call log. */
export function createInMemoryPackagingReads(
  options: InMemoryPackagingReadsOptions = {},
): StudioArtifactPackagingPort & {
  /** Test inspection: every getArtifactPackage read, in order. */
  readonly reads: readonly { readonly tenantId: string; readonly packageId: string; readonly version?: number }[];
} {
  const reads: { tenantId: string; packageId: string; version?: number }[] = [];
  const index = new Map(
    (options.packages ?? []).map((entry) => [
      JSON.stringify([entry.tenantId, String(entry.package.id), entry.package.version]),
      entry.package,
    ]),
  );
  return {
    getArtifactPackage(scope, packageId, version) {
      reads.push({ tenantId: String(scope.tenantId), packageId: String(packageId), version });
      return index.get(JSON.stringify([String(scope.tenantId), String(packageId), version]));
    },
    composeSessionPackage() {
      throw new Error("in-memory packaging reads double: composition is not part of the evaluation authority's surface (the bridge never packages)");
    },
    composeSuccessorVersion() {
      throw new Error("in-memory packaging reads double: composition is not part of the evaluation authority's surface (the bridge never packages)");
    },
    listPackageVersions() {
      return [];
    },
    listPackages() {
      return [];
    },
    reads,
  };
}

// ---------------------------------------------------------------------------
// The session-directory read double (scriptable summaries + call log)
// ---------------------------------------------------------------------------

/** A session-directory READ double: scriptable summaries + call log. */
export function createInMemorySessionDirectoryReads(
  summaries: readonly {
    readonly tenantId: string;
    readonly summary: StudioSessionSummaryRecord;
  }[] = [],
): StudioSessionDirectory & {
  /** Test inspection: every getSessionSummary read, in order. */
  readonly reads: readonly { readonly tenantId: string; readonly sessionId: string }[];
} {
  const reads: { tenantId: string; sessionId: string }[] = [];
  const index = new Map(
    summaries.map((entry) => [
      JSON.stringify([entry.tenantId, String(entry.summary.sessionRef)]),
      entry.summary,
    ]),
  );
  return {
    recordSessionSummary() {
      throw new Error("in-memory session-directory reads double: recording is the runtime's own mutator surface");
    },
    listSessionSummaries() {
      return [];
    },
    getSessionSummary(scope, sessionId) {
      reads.push({ tenantId: String(scope.tenantId), sessionId: String(sessionId) });
      return index.get(JSON.stringify([String(scope.tenantId), String(sessionId)]));
    },
    reads,
  };
}

// ---------------------------------------------------------------------------
// The bridge read double (scriptable entries + call log)
// ---------------------------------------------------------------------------

/** A bridge-port READ double: scriptable entry chains + call log. */
export function createInMemoryBridgeReads(
  entries: readonly {
    readonly tenantId: string;
    readonly entry: LabToStudioProductionEntry;
  }[] = [],
): LabToStudioBridgePort & {
  /** Test inspection: every getEntry read, in order. */
  readonly reads: readonly { readonly tenantId: string; readonly entryId: string; readonly version?: number }[];
} {
  const reads: { tenantId: string; entryId: string; version?: number }[] = [];
  const index = new Map(
    entries.map((entry) => [JSON.stringify([entry.tenantId, entry.entry.id]), entry.entry]),
  );
  return {
    enterProduction() {
      throw new Error("in-memory bridge reads double: entry creation is not part of the evaluation authority's surface");
    },
    recordStudioPackage() {
      throw new Error("in-memory bridge reads double: package citation is not part of the evaluation authority's surface");
    },
    getEntry(scope, entryId, version) {
      reads.push({ tenantId: String(scope.tenantId), entryId, version });
      const entry = index.get(JSON.stringify([String(scope.tenantId), entryId]));
      if (entry === undefined) {
        return undefined;
      }
      if (version === undefined || entry.version === version) {
        return entry;
      }
      return undefined;
    },
    listLatestEntries() {
      return [];
    },
    reads,
  };
}

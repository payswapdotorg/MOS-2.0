/**
 * Source/reference artifact import for the Studio runtime (STUDIO-009).
 *
 * The §6 pipeline's ACQUIRED-INPUT stage: reaction production (§16) reacts to
 * source material the session imports as a rights-cleared reference. Extracted
 * from `studio-runtime.ts` (file-length policy), mirroring `capture/open-capture.ts`.
 *
 * Fail-closed gates (typed failures, never silent — §27/§35: public URL
 * accessibility never implies media rights):
 * - the format must declare `captureRequirements.allowsMediaImport`;
 * - when the format requires rights-cleared sources, an import declaring
 *   `rightsCleared: false` is rejected (`source-rights-not-cleared`);
 * - the import must carry explicit rights + provenance refs (§27/§30).
 *
 * The imported artifact is created through the studio-side artifact factory
 * (stage `raw`, creationMethod `human-import`, no parents — an acquired input
 * is a lineage ROOT) and recorded into the session draft with its consent
 * coverage so the packaged output's consent summary stays truthful.
 */

import type { StudioSessionRecord } from "./session-state.js";
import type { ImportSourceArtifactRequest } from "./intake-types.js";
import type { StudioRuntimeError } from "./errors.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import { recordImportedSourceArtifact } from "./session-state.js";

/**
 * Import one source/reference artifact into `record`'s session draft through
 * the runtime's artifact factory. Returns the imported artifact or an
 * explicit typed failure.
 */
export async function importSourceArtifactForSession(
  record: StudioSessionRecord,
  request: ImportSourceArtifactRequest,
  ports: {
    readonly artifactFactory: StudioArtifactFactoryPort;
  },
): Promise<{ ok: true; source: StudioArtifactRef } | { ok: false; error: StudioRuntimeError }> {
  const plugin = record.formatPlugin;
  if (!plugin.captureRequirements.allowsMediaImport) {
    return {
      ok: false,
      error: { kind: "import-not-allowed-by-format", formatId: String(plugin.id) },
    };
  }
  if (
    plugin.inputRequirements.requiresRightsClearedSources &&
    request.rightsCleared !== true
  ) {
    return { ok: false, error: { kind: "source-rights-not-cleared", sourceRef: request.artifactId } };
  }
  if (String(request.rightsRef).length === 0 || String(request.provenanceRef).length === 0) {
    return {
      ok: false,
      error: { kind: "missing-source-rights-or-provenance-ref", sourceRef: request.artifactId },
    };
  }
  const created = await ports.artifactFactory.createArtifact({
    tenantId: record.tenantId,
    type: request.type,
    stage: "raw",
    creationMethod: "human-import",
    storageRef: request.storageRef,
    content: request.content ?? new TextEncoder().encode(`imported-source|${String(request.artifactId)}`),
    rightsRef: request.rightsRef,
    provenanceRef: request.provenanceRef,
    parents: [],
  });
  if (!created.ok) {
    return {
      ok: false,
      error: {
        kind: "invalid-processing-output",
        reasons: [`source import rejected by the artifact factory: ${JSON.stringify(created.error)}`],
      },
    };
  }
  recordImportedSourceArtifact(record, {
    artifact: created.artifact,
    consentRefs: [...(request.consentRefs ?? [])],
    sourceHolderIdentityRef: request.sourceHolderIdentityRef,
  });
  return { ok: true, source: created.artifact };
}

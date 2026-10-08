/**
 * The session-record → packaging-authority bridge (STUDIO-013).
 *
 * ONE helper both runtime packaging call sites use (the review-accept path in
 * review-handling.ts and the treatment path in studio-runtime.ts): it
 * projects the session record's draft state into the authority's
 * `SessionPackageCompositionInput` and routes it through THE canonical
 * packaging path. No session-side assembly exists anymore — the authority is
 * the only composer of session packages.
 */

import type { StudioArtifactPackageId, Timestamp } from "../../contracts/refs.js";
import type { StudioArtifactPackage } from "../../contracts/studio-artifact-package.js";
import type {
  PackagingEvaluationInput,
  RawArtifactConsentEntry,
  StudioPackagingFailure,
} from "../../contracts/artifact-packaging.js";
import type { StudioArtifactPackagingPort } from "../../ports/artifact-packaging.port.js";
import type { StudioSessionRecord } from "../session-state.js";

/** Compose-result of {@link composeSessionPackageFromRecord}. */
export type SessionPackageCompositionResult =
  | { readonly ok: true; readonly package: StudioArtifactPackage; readonly packageId: StudioArtifactPackageId }
  | { readonly ok: false; readonly failure: StudioPackagingFailure };

/**
 * Project `record`'s draft into the authority input and compose the next
 * package version through THE canonical packaging path.
 *
 * `packageId` is the already-assigned session package id, or `null` for the
 * first composition (then minted through `nextPackageId` and WRITTEN BACK
 * onto the record, mirroring the pre-STUDIO-013 behavior).
 */
export function composeSessionPackageFromRecord(
  record: StudioSessionRecord,
  request: {
    readonly packageId: StudioArtifactPackageId | null;
    readonly nextPackageId: () => string;
    readonly composedAt: Timestamp;
    readonly evaluation: PackagingEvaluationInput;
  },
  packaging: StudioArtifactPackagingPort,
): SessionPackageCompositionResult {
  let packageId = request.packageId;
  if (packageId === null) {
    packageId = request.nextPackageId() as StudioArtifactPackageId;
    record.packageId = packageId;
  }
  const predecessor =
    record.packages.length > 0 ? record.packages[record.packages.length - 1] : undefined;
  const rawArtifactConsent = new Map<string, RawArtifactConsentEntry>();
  for (const [artifactId, entry] of record.draft.rawArtifactConsent) {
    rawArtifactConsent.set(artifactId, entry);
  }
  const outcome = packaging.composeSessionPackage({ tenantId: record.tenantId }, {
    sessionRef: record.sessionId,
    packageId,
    predecessor,
    rawArtifacts: [...record.draft.rawArtifacts],
    intermediateArtifacts: [...record.draft.intermediateArtifacts],
    finalArtifacts: [...record.draft.finalArtifacts],
    transcriptRefs: [...record.draft.transcriptRefs],
    conversationGraphRef: record.draft.conversationGraphRef,
    editGraphRef: record.draft.editGraphRef,
    rawArtifactConsent,
    participantConsentRefs: [...record.participants.values()].flatMap((participant) => [
      ...participant.consent.consentRefs,
    ]),
    costLines: [...record.draft.costLines],
    captureSeconds: record.draft.captureSeconds,
    processingSeconds: record.draft.processingSeconds,
    sessionCreatedAt: record.createdAt,
    composedAt: request.composedAt,
    evaluation: request.evaluation,
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  return { ok: true, package: outcome.package, packageId };
}

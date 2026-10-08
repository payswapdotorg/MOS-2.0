/**
 * Internal session state of the Studio runtime (STUDIO-001).
 *
 * One `StudioSessionRecord` per live session: the immutable published
 * `StudioSession` view plus the mutable working state the runtime advances
 * (draft artifacts, participants, package versions, reviews, treatments).
 * Snapshots handed to callers are always freshly built and frozen; the
 * version counter on the published session bumps on every mutation
 * (§6 versioned lineage-preserving aggregates).
 *
 * Package versions are append-only: `packages[0]` is version 1 and no entry
 * is ever replaced — treatments create NEW versions (§19).
 */

import type {
  ConsentRef,
  MoneyAmount,
  ProvenanceRef,
  SessionParticipantId,
  StudioArtifactPackageId,
  StudioSessionId,
  TenantId,
  Timestamp,
} from "../contracts/refs.js";
import type { LoadedStudioOrganization, OrganizationSupplier } from "../contracts/organization-loading.js";
import type { StudioFormatPlugin } from "../contracts/studio-format.js";
import type {
  SessionParticipant,
  StudioProductionRequestView,
  StudioSession,
  StudioSessionLifecycleTransition,
  StudioSessionLifecycleState,
} from "../contracts/studio-session.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
  TranscriptRef,
  ConversationGraphRef,
  EditGraphRef,
} from "../contracts/studio-artifact-package.js";
import type { OutputTreatmentResult, StudioOutputReview, RightsPolicyRejection } from "../contracts/treatment.js";
import type { CapturedMediaReceipt } from "../contracts/capture.js";
import { isLegalTransition } from "./lifecycle.js";

/** Draft artifacts accumulated before packaging (§6 pipeline stages). */
export interface StudioSessionDraft {
  readonly rawArtifacts: StudioArtifactRef[];
  readonly intermediateArtifacts: StudioArtifactRef[];
  readonly finalArtifacts: StudioArtifactRef[];
  readonly transcriptRefs: TranscriptRef[];
  /** STUDIO-011: the real conversation graph ref (once processing recorded one). */
  conversationGraphRef: ConversationGraphRef | undefined;
  /** STUDIO-011: the real edit graph ref (once processing recorded one). */
  editGraphRef: EditGraphRef | undefined;
  /** Consent records covering each raw artifact (key: artifactId) — drives package consent summary. */
  readonly rawArtifactConsent: Map<string, readonly ConsentRef[]>;
  /** Cost lines accumulated from processing outputs and treatments. */
  readonly costLines: MoneyAmount[];
  captureSeconds: number;
  processingSeconds: number;
}

/** A treatment attempt that failed — recorded for audit, session state unchanged. */
export interface StudioTreatmentFailureEntry {
  readonly request: OutputTreatmentResult["request"];
  readonly failure:
    | { readonly kind: "execution-failure"; readonly reason: string }
    | { readonly kind: "rights-policy-rejection"; readonly rejection: RightsPolicyRejection };
  readonly failedAt: Timestamp;
}

/** Internal per-session record (mutable working state + immutable published view). */
export interface StudioSessionRecord {
  readonly sessionId: StudioSessionId;
  readonly tenantId: TenantId;
  readonly formatPlugin: StudioFormatPlugin;
  readonly requestView: StudioProductionRequestView;
  readonly supplier: OrganizationSupplier;
  /** Null until loadOrganization succeeds. */
  organization: LoadedStudioOrganization | null;
  /** Package id once the first version is assembled (constant afterwards). */
  packageId: StudioArtifactPackageId | null;
  readonly participants: Map<string, SessionParticipant>;
  /** Current published session snapshot (replaced on every mutation). */
  session: StudioSession;
  readonly draft: StudioSessionDraft;
  /** Append-only package versions (version 1 first; treatments append). */
  readonly packages: StudioArtifactPackage[];
  readonly reviews: StudioOutputReview[];
  readonly treatments: OutputTreatmentResult[];
  readonly treatmentFailures: StudioTreatmentFailureEntry[];
  readonly createdAt: Timestamp;
}

/** Public read-only view of one session (§30 observability). */
export interface StudioSessionView {
  readonly session: StudioSession;
  readonly request: StudioProductionRequestView;
  readonly organization: LoadedStudioOrganization | null;
  readonly participants: readonly SessionParticipant[];
  readonly rawArtifacts: readonly StudioArtifactRef[];
  readonly intermediateArtifacts: readonly StudioArtifactRef[];
  readonly finalArtifacts: readonly StudioArtifactRef[];
  readonly transcriptRefs: readonly TranscriptRef[];
  readonly packages: readonly StudioArtifactPackage[];
  readonly reviews: readonly StudioOutputReview[];
  readonly treatments: readonly OutputTreatmentResult[];
  readonly treatmentFailures: readonly StudioTreatmentFailureEntry[];
}

/** Initial draft for a new session. */
export function createEmptyDraft(): StudioSessionDraft {
  return {
    rawArtifacts: [],
    intermediateArtifacts: [],
    finalArtifacts: [],
    transcriptRefs: [],
    conversationGraphRef: undefined,
    editGraphRef: undefined,
    rawArtifactConsent: new Map(),
    costLines: [],
    captureSeconds: 0,
    processingSeconds: 0,
  };
}

/** Initial record for a new session (state 'requested', version 1). */
export function createSessionRecord(input: {
  sessionId: StudioSessionId;
  tenantId: TenantId;
  formatPlugin: StudioFormatPlugin;
  requestView: StudioProductionRequestView;
  supplier: OrganizationSupplier;
  createdAt: Timestamp;
}): StudioSessionRecord {
  return {
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    formatPlugin: input.formatPlugin,
    requestView: input.requestView,
    supplier: input.supplier,
    organization: null,
    packageId: null,
    participants: new Map(),
    session: {
      id: input.sessionId,
      version: 1,
      productionRequestRef: input.requestView.id,
      formatVersion: { formatId: input.formatPlugin.id, version: input.formatPlugin.version },
      organizationRef: input.requestView.organizationRef,
      participants: [],
      lifecycle: { state: "requested", transitions: [] },
      artifactPackageRef: null,
      createdAt: input.createdAt,
    },
    draft: createEmptyDraft(),
    packages: [],
    reviews: [],
    treatments: [],
    treatmentFailures: [],
    createdAt: input.createdAt,
  };
}

/** Rebuild the published session snapshot from the record (freezes it). */
export function snapshotSession(record: StudioSessionRecord): StudioSession {
  const session: StudioSession = Object.freeze({
    id: record.sessionId,
    version: record.session.version,
    productionRequestRef: record.requestView.id,
    formatVersion: { formatId: record.formatPlugin.id, version: record.formatPlugin.version },
    organizationRef: record.requestView.organizationRef,
    participants: Object.freeze([...record.participants.values()].map((p) => Object.freeze(p))),
    lifecycle: Object.freeze({ ...record.session.lifecycle }),
    artifactPackageRef: record.session.artifactPackageRef,
    createdAt: record.createdAt,
  });
  return session;
}

/**
 * Append a lifecycle transition (append-only history). Legality MUST be
 * validated by the caller; this helper asserts it as an internal invariant.
 */
export function applyLifecycleTransition(
  record: StudioSessionRecord,
  to: StudioSessionLifecycleState,
  at: Timestamp,
  reason?: string,
  actor?: string,
): StudioSessionRecord {
  const from = record.session.lifecycle.state;
  if (!isLegalTransition(from, to)) {
    throw new Error(
      `studio invariant violation: illegal transition ${from} -> ${to} (caller must pre-validate)`,
    );
  }
  const transition: StudioSessionLifecycleTransition = Object.freeze({ from, to, at, reason, actor });
  const transitions: readonly StudioSessionLifecycleTransition[] = [
    ...record.session.lifecycle.transitions,
    transition,
  ];
  record.session = Object.freeze({
    ...record.session,
    version: record.session.version + 1,
    lifecycle: Object.freeze({ state: to, transitions }),
  });
  return record;
}

/** Register a joined participant and re-snapshot the session (version bump). */
export function appendParticipant(
  record: StudioSessionRecord,
  participant: SessionParticipant,
): StudioSessionRecord {
  record.participants.set(participant.participantId, participant);
  record.session = Object.freeze({
    ...record.session,
    version: record.session.version + 1,
    participants: Object.freeze([...record.participants.values()].map((p) => Object.freeze(p))),
  });
  return record;
}

/**
 * Record one sealed raw capture into the draft: appends the raw artifact,
 * its consent coverage and the capture duration, and extends the capturing
 * participant's contribution provenance (§15).
 */
export function recordRawArtifact(
  record: StudioSessionRecord,
  input: {
    readonly artifact: StudioArtifactRef;
    readonly receipt: CapturedMediaReceipt;
    readonly consentRefs: readonly ConsentRef[];
    readonly capturedByParticipantId: SessionParticipantId;
  },
): StudioSessionRecord {
  record.draft.rawArtifacts.push(input.artifact);
  record.draft.rawArtifactConsent.set(input.artifact.artifactId, input.consentRefs);
  record.draft.captureSeconds += input.receipt.durationSeconds;
  const participant = record.participants.get(input.capturedByParticipantId);
  if (participant !== undefined) {
    const provenanceRefs = [
      ...new Set([...participant.contributionProvenance.provenanceRefs, input.artifact.provenanceRef]),
    ] as ProvenanceRef[];
    record.participants.set(participant.participantId, {
      ...participant,
      contributionProvenance: { provenanceRefs },
    });
  }
  record.session = Object.freeze({
    ...record.session,
    version: record.session.version + 1,
    participants: Object.freeze([...record.participants.values()].map((p) => Object.freeze(p))),
  });
  return record;
}

/**
 * Record one imported source/reference artifact (the §6 acquired-input stage,
 * STUDIO-009) into the draft: appends the raw artifact and its consent
 * coverage. Imported sources are parentless RAW acquisitions — the lineage
 * roots of everything the organization later composes over them.
 */
export function recordImportedSourceArtifact(
  record: StudioSessionRecord,
  input: {
    readonly artifact: StudioArtifactRef;
    readonly consentRefs: readonly ConsentRef[];
  },
): StudioSessionRecord {
  record.draft.rawArtifacts.push(input.artifact);
  record.draft.rawArtifactConsent.set(input.artifact.artifactId, input.consentRefs);
  record.session = Object.freeze({
    ...record.session,
    version: record.session.version + 1,
  });
  return record;
}

/** Point the session at a (new) package version and re-snapshot (version bump). */
export function attachPackageVersion(
  record: StudioSessionRecord,
  packageId: StudioArtifactPackage["id"],
  packageVersion: number,
): StudioSessionRecord {
  record.session = Object.freeze({
    ...record.session,
    version: record.session.version + 1,
    artifactPackageRef: Object.freeze({ packageId, version: packageVersion }),
  });
  return record;
}

/** Build the public read view of a record (frozen arrays; live record excluded). */
export function buildSessionView(record: StudioSessionRecord): StudioSessionView {
  return Object.freeze({
    session: record.session,
    request: record.requestView,
    organization: record.organization,
    participants: Object.freeze([...record.participants.values()]),
    rawArtifacts: Object.freeze([...record.draft.rawArtifacts]),
    intermediateArtifacts: Object.freeze([...record.draft.intermediateArtifacts]),
    finalArtifacts: Object.freeze([...record.draft.finalArtifacts]),
    transcriptRefs: Object.freeze([...record.draft.transcriptRefs]),
    packages: Object.freeze([...record.packages]),
    reviews: Object.freeze([...record.reviews]),
    treatments: Object.freeze([...record.treatments]),
    treatmentFailures: Object.freeze([...record.treatmentFailures]),
  });
}

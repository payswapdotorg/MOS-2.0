/**
 * The Studio runtime (STUDIO-001) — the single session lifecycle manager.
 *
 * One runtime, many formats (§13): session intake (ProductionRequest OR
 * standalone intent), versioned organization loading with explicit
 * compatibility verdicts, per-participant consent enforcement (§15
 * multi-account rules — identity / account boundary / authorization /
 * participation grant / consent / contribution provenance stay separate,
 * never merged), validated lifecycle transitions
 * (requested → loading → capturing → processing → review → packaged, plus
 * rejection/treatment branches and terminal states), raw capture intake
 * (STUDIO-005), processing output intake with lineage validation, review
 * handling with quality-vs-rights rejection discrimination (§19), treatment
 * application creating NEW immutable linked artifact package versions (§19),
 * and artifact package assembly (raw → intermediate → final, transcripts,
 * graphs, cost, duration).
 *
 * THE STUDIO NEVER PUBLISHES: there is no distribution/provider/publish code
 * path in this package at all — asserted by src/runtime/no-publish.test.ts.
 *
 * Wave 1 dependency reconciliation (disclosed): backlog deps AGT-001
 * (organizations), CAP-001/ENG-001 (capability/engine execution), CORE-004
 * (contracts/content) are NOT in this base, so the runtime consumes the
 * studio-owned ports (`StudioOrganizationLoader`,
 * `StudioArtifactFactoryPort`, `StudioOutputTreatmentPort`,
 * `CaptureSourcePort`) bound in tests to DISCLOSED in-memory test doubles.
 * Later waves rebind the ports to the real modules; the runtime logic is the
 * deliverable. Session/package state is held in memory (durable persistence
 * belongs to the jobs/content modules).
 */

import { randomUUID } from "node:crypto";
import type { OrganizationLoadRequest, StudioOrganizationLoader } from "../contracts/organization-loading.js";
import type { StudioArtifactPackageId, StudioSessionId, TenantId, Timestamp } from "../contracts/refs.js";
import type { StudioOutputReview, StudioOutputTreatmentPort, OutputTreatmentRequest } from "../contracts/treatment.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { FormatRegistry } from "./format-registry.js";
import type { StudioRuntimeOutcome } from "./errors.js";
import { notFound, stateError } from "./runtime-error-helpers.js";
import { isLegalTransition } from "./lifecycle.js";
import { assembleArtifactPackage } from "./package-assembly.js";
import {
  applyLifecycleTransition,
  appendParticipant,
  attachPackageVersion,
  buildSessionView,
  createSessionRecord,
  snapshotSession,
  type StudioSessionRecord,
  type StudioSessionView,
} from "./session-state.js";
import type {
  CreateStudioSessionInput,
  ImportSourceArtifactRequest,
  JoinParticipantRequest,
  OpenCaptureRequest,
  StudioProcessingOutput,
  SubmitReviewInput,
} from "./intake-types.js";
import { materializeStandaloneRequest } from "./intake-types.js";
import type {
  CreatedSessionValue,
  ImportedSourceValue,
  JoinedParticipantValue,
  LoadedOrganizationValue,
  ReviewHandledValue,
  SessionSnapshotValue,
  StudioRuntimeDeps,
  TreatmentAppliedValue,
} from "./runtime-outcomes.js";
import { checkRejectionMatchesOutcome, validateProcessingOutput } from "./intake-validation.js";
import { admitParticipant, buildSessionParticipant } from "./participant-intake.js";
import type { ParticipantConsentPort } from "../ports/participant-consent.js";
import type { ParticipantIdentityPort } from "../ports/participant-identity.js";
import { applyReviewOutcome } from "./review-handling.js";
import { openCaptureForSession } from "./capture/open-capture.js";
import { importSourceArtifactForSession } from "./source-import.js";
import type { StudioCaptureSession } from "./capture/studio-capture-session.js";
import type { CaptureSourcePort } from "./capture/capture-source-port.js";

/**
 * The Studio runtime. One instance manages many sessions; every method
 * returns an explicit ok/failure union (no thrown business errors).
 *
 * Public methods (12 ≤ policy maxPublicMethods 12): createSession,
 * loadOrganization, joinParticipant, importSourceArtifact, openCapture,
 * beginProcessing, completeProcessing, submitReview, applyTreatment,
 * closeSession, abandonSession, getSession.
 */
export class StudioRuntime {
  private readonly sessions = new Map<string, StudioSessionRecord>();
  private readonly registry: FormatRegistry;
  private readonly organizationLoader: StudioOrganizationLoader;
  private readonly artifactFactory: StudioArtifactFactoryPort;
  private readonly treatmentExecutor: StudioOutputTreatmentPort;
  private readonly captureSourcePort: CaptureSourcePort;
  /** STUDIO-006: REAL identity + rights authorities behind studio ports. */
  private readonly participantIdentityPort: ParticipantIdentityPort;
  private readonly participantConsentPort: ParticipantConsentPort;
  private readonly clock: () => Timestamp;
  private readonly idFactory: () => string;

  constructor(deps: StudioRuntimeDeps) {
    this.registry = deps.formatRegistry;
    this.organizationLoader = deps.organizationLoader;
    this.artifactFactory = deps.artifactFactory;
    this.treatmentExecutor = deps.treatmentExecutor;
    this.captureSourcePort = deps.captureSourcePort;
    this.participantIdentityPort = deps.participantIdentityPort;
    this.participantConsentPort = deps.participantConsentPort;
    this.clock = deps.clock ?? (() => new Date().toISOString() as Timestamp);
    this.idFactory = deps.idFactory ?? (() => randomUUID());
  }

  /** Create a session from a ProductionRequest or a standalone intent (§13). */
  async createSession(input: CreateStudioSessionInput): Promise<StudioRuntimeOutcome<CreatedSessionValue>> {
    const requestView =
      input.kind === "production-request"
        ? input.request
        : materializeStandaloneRequest(input.intent, () => `prs_${this.idFactory()}`);
    const supplier = input.kind === "production-request" ? input.supplier : input.intent.supplier;
    const tenantId: TenantId = input.kind === "production-request" ? input.tenantId : input.intent.tenantId;
    const intake =
      input.kind === "production-request"
        ? input.intake
        : {
            inputKind: input.intent.inputKind,
            sourceArtifacts: input.intent.sourceArtifacts ?? [],
            participantCount: input.intent.plannedParticipants,
            hasScriptOrQuestionGraph:
              input.intent.inputKind === "complete-script" || input.intent.inputKind === "question-list",
          };
    const format = requestView.studioFormat;
    const resolution = this.registry.resolve(format.formatId, format.version);
    if (!resolution.ok) {
      return {
        ok: false,
        error: {
          kind: "format-not-registered",
          formatId: format.formatId,
          version: "version" in resolution.error ? resolution.error.version : undefined,
        },
      };
    }
    const plugin = resolution.plugin;
    const validation = plugin.validateSessionInput(intake);
    if (!validation.ok) {
      return { ok: false, error: { kind: "invalid-session-input", reasons: validation.reasons } };
    }
    const sessionId = `sess_${this.idFactory()}` as StudioSessionId;
    const record = createSessionRecord({
      sessionId,
      tenantId,
      formatPlugin: plugin,
      requestView,
      supplier,
      createdAt: this.clock(),
    });
    this.sessions.set(sessionId, record);
    return { ok: true, value: { session: snapshotSession(record) } };
  }

  /** Load the caller-supplied versioned organization; success → capturing. */
  async loadOrganization(sessionId: StudioSessionId): Promise<StudioRuntimeOutcome<LoadedOrganizationValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "requested") {
      return stateError("loadOrganization", record);
    }
    applyLifecycleTransition(record, "loading", this.clock(), "organization-load-started", "studio-runtime");
    const loadRequest: OrganizationLoadRequest = {
      organizationRef: record.requestView.organizationRef,
      suppliedBy: record.supplier,
      formatCompatibility: record.formatPlugin.organizationCompatibility,
    };
    const result = await this.organizationLoader.load(loadRequest);
    if (!result.ok) {
      record.organization = null;
      applyLifecycleTransition(record, "failed", this.clock(), `organization-load:${result.error.kind}`, "studio-runtime");
      return {
        ok: false,
        error: {
          kind: "organization-load-failed",
          organizationRef: record.requestView.organizationRef,
          error: result.error,
        },
      };
    }
    record.organization = result.loaded;
    if (!result.loaded.compatibility.compatible) {
      applyLifecycleTransition(record, "failed", this.clock(), "incompatible-with-format", "studio-runtime");
      return {
        ok: false,
        error: {
          kind: "organization-incompatible",
          organizationRef: record.requestView.organizationRef,
          incompatibilityReasons: result.loaded.compatibility.incompatibilityReasons,
        },
      };
    }
    applyLifecycleTransition(record, "capturing", this.clock(), "organization-loaded", "studio-runtime");
    return { ok: true, value: { session: snapshotSession(record) } };
  }

  /**
   * Join a participant through the REAL identity + rights authorities
   * (§15/STUDIO-006): the identity must exist with an active tenant
   * membership, and consent coverage is DERIVED from real consent records.
   */
  async joinParticipant(sessionId: StudioSessionId, request: JoinParticipantRequest): Promise<StudioRuntimeOutcome<JoinedParticipantValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    const admission = await admitParticipant(record, request, {
      participantIdentityPort: this.participantIdentityPort,
      participantConsentPort: this.participantConsentPort,
    });
    if (!admission.ok) {
      return { ok: false, error: admission.error };
    }
    const participant = buildSessionParticipant(
      request,
      sessionId,
      this.clock(),
      () => `grant_${this.idFactory()}`,
      admission.consent,
    );
    appendParticipant(record, participant);
    return { ok: true, value: { session: snapshotSession(record), participant } };
  }

  /**
   * Import one source/reference artifact into the session as an ACQUIRED
   * INPUT (STUDIO-009, §6/§16/§27): reaction production reacts to
   * rights-cleared source material. Fail-closed on the format's import +
   * rights declarations — an uncleared source is a typed failure, never a
   * silent admission.
   */
  async importSourceArtifact(
    sessionId: StudioSessionId,
    request: ImportSourceArtifactRequest,
  ): Promise<StudioRuntimeOutcome<ImportedSourceValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "capturing") {
      return stateError("importSourceArtifact", record);
    }
    const imported = await importSourceArtifactForSession(record, request, {
      artifactFactory: this.artifactFactory,
    });
    return imported.ok
      ? { ok: true, value: { session: snapshotSession(record), source: imported.source } }
      : { ok: false, error: imported.error };
  }

  /** Open a capture bound to the session + a consented participant (STUDIO-005). */
  async openCapture(sessionId: StudioSessionId, request: OpenCaptureRequest): Promise<StudioRuntimeOutcome<StudioCaptureSession>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "capturing") {
      return stateError("openCapture", record);
    }
    const opened = await openCaptureForSession(record, request, {
      captureSourcePort: this.captureSourcePort,
      artifactFactory: this.artifactFactory,
      participantConsentPort: this.participantConsentPort,
    });
    return opened.ok ? { ok: true, value: opened.capture } : { ok: false, error: opened.error };
  }

  /** capturing → processing. Enforces participant minimum + processing consent. */
  async beginProcessing(sessionId: StudioSessionId): Promise<StudioRuntimeOutcome<SessionSnapshotValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "capturing") {
      return stateError("beginProcessing", record);
    }
    const model = record.formatPlugin.participantModel;
    if (record.participants.size < model.minimumParticipants) {
      return {
        ok: false,
        error: {
          kind: "participant-count-out-of-range",
          count: record.participants.size,
          minimum: model.minimumParticipants,
          maximum: model.maximumParticipants,
        },
      };
    }
    if (record.draft.rawArtifacts.length > 0) {
      // STUDIO-006: LIVE consent re-resolution — a mid-session revocation in
      // the rights authority blocks processing even though the join-time
      // consent snapshot stayed frozen.
      for (const participant of record.participants.values()) {
        const consent = await this.participantConsentPort.resolveParticipantConsent({
          tenantId: record.tenantId,
          sessionId: record.sessionId,
          participantIdentityRef: participant.identityRef,
          consentRefs: participant.consent.consentRefs,
        });
        if (!consent.coversProcessingIntoArtifacts) {
          return { ok: false, error: { kind: "consent-required-for-processing", participantId: participant.participantId } };
        }
      }
    }
    applyLifecycleTransition(record, "processing", this.clock(), "processing-started", "studio-runtime");
    return { ok: true, value: { session: snapshotSession(record) } };
  }

  /** Record organization-produced artifacts (intermediate/final) and go to review. */
  async completeProcessing(sessionId: StudioSessionId, output: StudioProcessingOutput): Promise<StudioRuntimeOutcome<SessionSnapshotValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "processing") {
      return stateError("completeProcessing", record);
    }
    const reasons = validateProcessingOutput(record, output);
    if (reasons.length > 0) {
      return { ok: false, error: { kind: "invalid-processing-output", reasons } };
    }
    record.draft.intermediateArtifacts.push(...output.intermediateArtifacts);
    record.draft.finalArtifacts.push(...output.finalArtifacts);
    if (output.transcriptRefs !== undefined) {
      record.draft.transcriptRefs.push(...output.transcriptRefs);
    }
    // STUDIO-011: processing may record the REAL conversation/edit graph refs
    // the organization derived its output from; they flow into the packaged
    // artifact package (synthesized placeholders otherwise, W1-C behavior).
    if (output.conversationGraphRef !== undefined) {
      record.draft.conversationGraphRef = output.conversationGraphRef;
    }
    if (output.editGraphRef !== undefined) {
      record.draft.editGraphRef = output.editGraphRef;
    }
    if (output.additionalCost !== undefined) {
      // W10-B ownership: the draft owns a FROZEN copy of the declared cost —
      // the caller's MoneyAmount object is never aliased into stored session
      // state (a post-submission mutation cannot rewrite the packaged cost).
      record.draft.costLines.push(Object.freeze({ ...output.additionalCost }));
    }
    if (output.processingSeconds !== undefined) {
      record.draft.processingSeconds += output.processingSeconds;
    }
    applyLifecycleTransition(record, "review", this.clock(), "processing-completed", "studio-runtime");
    return { ok: true, value: { session: snapshotSession(record) } };
  }

  /** Submit a review decision (§19 outcomes; quality ≠ rights/policy rejection). */
  async submitReview(sessionId: StudioSessionId, input: SubmitReviewInput): Promise<StudioRuntimeOutcome<ReviewHandledValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "review") {
      return stateError("submitReview", record);
    }
    const target = record.draft.finalArtifacts.find((a) => a.artifactId === input.targetArtifactId);
    if (target === undefined) {
      return { ok: false, error: { kind: "review-target-not-found", artifactId: input.targetArtifactId } };
    }
    const rejectionCheck = checkRejectionMatchesOutcome(input.outcome, input.rejection);
    if (rejectionCheck !== undefined) {
      return { ok: false, error: rejectionCheck };
    }
    const review: StudioOutputReview = Object.freeze({
      sessionId,
      targetArtifact: target,
      outcome: input.outcome,
      rejection: input.rejection,
      decidedBy: input.decidedBy,
      decidedAt: this.clock(),
    });
    return applyReviewOutcome(record, review, {
      now: this.clock,
      nextPackageId: () => `pkg_${this.idFactory()}`,
    });
  }

  /**
   * Apply a treatment (§19): NEW immutable linked package version when the
   * session is packaged; successors into the draft + review transition when
   * the session is in the treatment branch (processing).
   */
  async applyTreatment(sessionId: StudioSessionId, request: OutputTreatmentRequest): Promise<StudioRuntimeOutcome<TreatmentAppliedValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    const state = record.session.lifecycle.state;
    if (state !== "processing" && state !== "packaged") {
      return stateError("applyTreatment", record);
    }
    if (request.sessionId !== sessionId) {
      return { ok: false, error: { kind: "session-not-found", sessionId: request.sessionId } };
    }
    const latestPackage = record.packages.length > 0 ? record.packages[record.packages.length - 1] : undefined;
    const knownArtifacts: readonly StudioArtifactRef[] =
      state === "packaged" && latestPackage !== undefined
        ? [...latestPackage.rawArtifacts, ...latestPackage.intermediateArtifacts, ...latestPackage.finalArtifacts]
        : [...record.draft.rawArtifacts, ...record.draft.intermediateArtifacts, ...record.draft.finalArtifacts];
    const target = knownArtifacts.find((a) => a.artifactId === request.targetArtifact.artifactId);
    if (target === undefined) {
      return { ok: false, error: { kind: "treatment-target-not-found", artifactId: request.targetArtifact.artifactId } };
    }
    const outcome = await this.treatmentExecutor.applyTreatment(request);
    if (!outcome.ok) {
      record.treatmentFailures.push({ request, failure: outcome.failure, failedAt: this.clock() });
      return { ok: false, error: { kind: "treatment-failed", request, failure: outcome.failure } };
    }
    record.treatments.push(outcome.result);
    for (const successor of outcome.result.successorArtifacts) {
      if (successor.stage === "intermediate") {
        record.draft.intermediateArtifacts.push(successor);
      } else {
        record.draft.finalArtifacts.push(successor);
      }
    }
    if (state === "packaged") {
      let packageId: StudioArtifactPackageId = record.packageId as StudioArtifactPackageId;
      if (record.packageId === null) {
        packageId = `pkg_${this.idFactory()}` as StudioArtifactPackageId;
        record.packageId = packageId;
      }
      const pkg = assembleArtifactPackage(record, packageId, this.clock(), {
        status: "pending",
        outcome: "treatment-requested",
      });
      record.packages.push(pkg);
      attachPackageVersion(record, packageId, pkg.version);
      return { ok: true, value: { session: snapshotSession(record), result: outcome.result, package: pkg } };
    }
    applyLifecycleTransition(record, "review", this.clock(), "treatment-completed", "studio-runtime");
    return { ok: true, value: { session: snapshotSession(record), result: outcome.result } };
  }

  /** packaged → closed. */
  async closeSession(sessionId: StudioSessionId): Promise<StudioRuntimeOutcome<SessionSnapshotValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    if (record.session.lifecycle.state !== "packaged") {
      return stateError("closeSession", record);
    }
    applyLifecycleTransition(record, "closed", this.clock(), "session-closed", "studio-runtime");
    return { ok: true, value: { session: snapshotSession(record) } };
  }

  /** Any non-terminal state → abandoned (auditable terminal). */
  async abandonSession(sessionId: StudioSessionId, reason?: string): Promise<StudioRuntimeOutcome<SessionSnapshotValue>> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return notFound(sessionId);
    }
    const state = record.session.lifecycle.state;
    if (state === "closed" || state === "abandoned" || state === "failed") {
      return stateError("abandonSession", record);
    }
    if (!isLegalTransition(state, "abandoned")) {
      return {
        ok: false,
        error: { kind: "invalid-lifecycle-transition", from: state, to: "abandoned", attemptedBy: "abandonSession" },
      };
    }
    applyLifecycleTransition(record, "abandoned", this.clock(), reason ?? "abandoned", "studio-runtime");
    return { ok: true, value: { session: snapshotSession(record) } };
  }

  /** Read-only observability view (§30). */
  getSession(sessionId: StudioSessionId): StudioSessionView | undefined {
    const record = this.sessions.get(sessionId);
    return record === undefined ? undefined : buildSessionView(record);
  }
}

/** Create the single Studio runtime. */
export function createStudioRuntime(deps: StudioRuntimeDeps): StudioRuntime {
  return new StudioRuntime(deps);
}

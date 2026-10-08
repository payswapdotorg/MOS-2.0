/**
 * Studio artifact-package packaging contracts (STUDIO-013).
 *
 * THE canonical packaging authority surface of the Content Studio: every
 * format flow (reaction, audio-podcast, video-podcast) composes its
 * `StudioArtifactPackage` through the ONE authority behind
 * {@link ../ports/artifact-packaging.port.js!StudioArtifactPackagingPort} —
 * required fields are complete BY CONSTRUCTION (the
 * spec/contracts/core-contracts-v2.0.yaml `StudioArtifactPackage` required
 * set), never by caller goodwill. Every gap is a TYPED failure (the
 * fail-closed battery below); the synthesized edit-graph placeholder of the
 * W1-C behavior is GONE — a package must cite the REAL recorded edit graph
 * of its composition.
 *
 * Two composition shapes, ONE authority:
 * - `SessionPackageCompositionInput`: the session-draft packaging (the review
 *   accept path of `StudioRuntime.submitReview` and the treatment successor
 *   path of `StudioRuntime.applyTreatment`). STRICT battery: raw artifacts,
 *   transcripts, a REAL edit-graph ref, per-artifact provenance, closed +
 *   root-traceable lineage (§6), full consent coverage of every raw artifact
 *   INCLUDING imported sources (§15/§27), an evaluation record, and finite
 *   cost/duration (the W9-B D5 guard).
 * - `SuccessorPackageCompositionInput`: the editing-composition successor
 *   version (STUDIO-008's new immutable treatment version over a packaged
 *   artifact or over session intermediates). The §19 discipline: same package
 *   id at version+1 (or a new id for an intermediates source), predecessors
 *   NEVER mutated, the new edit-graph ref REQUIRED, provenance complete,
 *   finite cost/duration. Transcripts/raw artifacts are inherited from the
 *   predecessor when one exists (a caller-supplied predecessor may predate
 *   the studio's own strict battery — the authority records the projections
 *   truthfully instead of failing).
 *
 * Immutable versioned packages: the authority's store is append-only per
 * (tenant, package id) — composing a version that already exists is a typed
 * `version-conflict`; historical packages are never rewritten (the
 * treatment-creates-a-new-version discipline of §19/W8-C).
 *
 * W9-B disciplines by construction: composed packages are
 * clone-then-deep-frozen (D3 — the caller's draft artifacts are never aliased
 * into the store and never frozen in place), the store keys are exact
 * per-tenant maps with exact-tenant listings (D1/D2), and cost/duration
 * carry finite-number guards (D5).
 *
 * Basis: spec/mos-architecture-v2.0.md §6 (artifact graph: lineage immutable
 * and traceable root→final), §16 (entry intermediates), §12 (edit graphs are
 * MOS-owned records), §14 (synthetic provenance labels), §15/§27 (consent
 * coverage of every raw artifact incl. imported sources), §19 (every
 * treatment creates a new immutable linked version), §30 (recorded,
 * attributable composition), §31 (tenant scoping);
 * spec/mos-architecture-lock-v2.0.md rules 14/15/23.
 */

import type {
  ConsentRef,
  IdentityRef,
  MoneyAmount,
  StudioArtifactPackageId,
  StudioSessionId,
  Timestamp,
} from "./refs.js";
import type {
  ConversationGraphRef,
  EditGraphRef,
  StudioArtifactPackage,
  StudioArtifactPackageEvaluation,
  StudioArtifactRef,
  TranscriptRef,
} from "./studio-artifact-package.js";
import type { EditingCompositionGraph, EditingContributor } from "./editing-composition.js";

// ---------------------------------------------------------------------------
// The fail-closed packaging battery (typed failures, never silent)
// ---------------------------------------------------------------------------

/**
 * Every typed failure of the canonical packaging path. Each names the exact
 * gap in the contract-required set or the violated immutability/finite-number
 * discipline — the studio never packages around a gap.
 */
export type StudioPackagingFailure =
  | { readonly kind: "raw-artifacts-required"; readonly sessionRef: StudioSessionId }
  | { readonly kind: "transcripts-required"; readonly sessionRef: StudioSessionId }
  | { readonly kind: "edit-graph-ref-required"; readonly sessionRef: StudioSessionId }
  | {
      /** Every packaged artifact must carry a non-blank provenance ref (§30). */
      readonly kind: "provenance-incomplete";
      readonly sessionRef: StudioSessionId;
      readonly artifactIds: readonly string[];
    }
  | {
      /** Every intermediate/final must carry parents (§6 closed lineage). */
      readonly kind: "lineage-incomplete";
      readonly sessionRef: StudioSessionId;
      readonly artifactIds: readonly string[];
    }
  | {
      /** Every final must trace through parents to a raw root IN the package (§6). */
      readonly kind: "lineage-untraceable";
      readonly sessionRef: StudioSessionId;
      readonly artifactIds: readonly string[];
    }
  | {
      /** Every raw artifact (incl. imported sources) needs consent coverage (§15/§27). */
      readonly kind: "consent-coverage-incomplete";
      readonly sessionRef: StudioSessionId;
      readonly uncoveredRawArtifactIds: readonly string[];
      readonly participantConsentRefsPresent: boolean;
    }
  | { readonly kind: "evaluation-required"; readonly sessionRef: StudioSessionId }
  | {
      /** Finite-number + one-currency guard on cost lines (W9-B D5). */
      readonly kind: "cost-invalid";
      readonly sessionRef: StudioSessionId;
      readonly reasons: readonly string[];
    }
  | {
      /** Finite-number guard on durations (W9-B D5). */
      readonly kind: "duration-invalid";
      readonly sessionRef: StudioSessionId;
      readonly reasons: readonly string[];
    }
  | {
      /** Append-only store discipline: the version already exists (never rewritten). */
      readonly kind: "version-conflict";
      readonly packageId: StudioArtifactPackageId;
      readonly attemptedVersion: number;
      readonly latestVersion: number;
    };

/** Ok/failure pair of every authority composition. */
export type StudioPackagingOutcome =
  | { readonly ok: true; readonly package: StudioArtifactPackage }
  | { readonly ok: false; readonly failure: StudioPackagingFailure };

// ---------------------------------------------------------------------------
// Session-draft composition (the STRICT battery)
// ---------------------------------------------------------------------------

/**
 * Consent coverage of ONE raw artifact: the consent records covering its
 * contribution to the packaged output plus (when known) the identity of the
 * consenting holder — §15 live re-resolution at operator actions resolves
 * through the holder identity (captures: the capturing participant; imported
 * sources: the source holder).
 */
export interface RawArtifactConsentEntry {
  readonly consentRefs: readonly ConsentRef[];
  /** Identity of the consenting holder (the §15 re-resolution subject). */
  readonly holderIdentityRef?: IdentityRef;
}

/** The evaluation record a composition is motivated by (§19). */
export interface PackagingEvaluationInput {
  readonly status: StudioArtifactPackageEvaluation["status"];
  readonly outcome: StudioArtifactPackageEvaluation["outcome"];
  readonly evaluationRef?: string;
}

/**
 * The session-draft packaging input. Built by the Studio runtime from the
 * session record (review accept / treatment successor); every field the
 * contract-YAML required set names is supplied explicitly — the authority
 * validates and fails closed.
 */
export interface SessionPackageCompositionInput {
  readonly sessionRef: StudioSessionId;
  /** Package id (an already-assigned id, or the freshly minted first id). */
  readonly packageId: StudioArtifactPackageId;
  /** The session's latest composed version, when one exists (treatment path). */
  readonly predecessor?: StudioArtifactPackage;
  readonly rawArtifacts: readonly StudioArtifactRef[];
  readonly intermediateArtifacts: readonly StudioArtifactRef[];
  readonly finalArtifacts: readonly StudioArtifactRef[];
  readonly transcriptRefs: readonly TranscriptRef[];
  /**
   * The REAL conversation graph ref when the format produced one (the podcast
   * flows). Formats without an adaptive-interview conversation keep the
   * session-scoped synthesized reference (the field is contract-required; the
   * edit-graph ref below is the one that must be REAL).
   */
  readonly conversationGraphRef?: ConversationGraphRef;
  /**
   * REQUIRED: the REAL recorded edit graph of the composition. The W1-C
   * synthesized placeholder is gone — `edit-graph-ref-required` fires when
   * absent or blank.
   */
  readonly editGraphRef?: EditGraphRef;
  /** Consent coverage per raw artifact id (captures AND imported sources). */
  readonly rawArtifactConsent: ReadonlyMap<string, RawArtifactConsentEntry>;
  readonly participantConsentRefs: readonly ConsentRef[];
  readonly costLines: readonly MoneyAmount[];
  readonly captureSeconds: number;
  readonly processingSeconds: number;
  readonly sessionCreatedAt: Timestamp;
  readonly composedAt: Timestamp;
  readonly evaluation: PackagingEvaluationInput;
}

// ---------------------------------------------------------------------------
// Editing-composition successor (the §19 treatment version)
// ---------------------------------------------------------------------------

/**
 * The successor-version packaging input of an editing session (STUDIO-008's
 * Phase 6). Same package id at version+1 over a packaged source; a NEW id
 * over an intermediates source. Predecessors are never mutated. The tenant
 * scope arrives as the port method's own first argument (the repo-wide port
 * discipline — the scope is never embedded in caller-supplied input).
 */
export interface SuccessorPackageCompositionInput {
  /** The edited source: a packaged artifact, or intermediates of a session. */
  readonly source:
    | { readonly kind: "package"; readonly artifactPackage: StudioArtifactPackage }
    | {
        readonly kind: "intermediates";
        readonly sessionRef: StudioSessionId;
        readonly intermediates: readonly StudioArtifactRef[];
      };
  /** The newly created studio-side intermediate versions (one per operation). */
  readonly operationOutputs: readonly StudioArtifactRef[];
  /** The final assembly artifact, or `null` for the honest no-op session. */
  readonly finalArtifact: StudioArtifactRef | null;
  /** The recorded edit graph of the session (graphId/version/otio projection). */
  readonly graph: Pick<EditingCompositionGraph, "graphId" | "version" | "otioInterchange">;
  /** New package id for the intermediates source (ignored when packaged). */
  readonly newPackageId: StudioArtifactPackageId;
  readonly completedAt: Timestamp;
  readonly startedAt: Timestamp;
  /** Engine-usage cost of the session (canonical numeric amount, finite ≥ 0). */
  readonly cost: { readonly currency: string; readonly amount: number };
  /** §15 contributors of the session input (their consent refs are inherited). */
  readonly contributors: readonly EditingContributor[];
  readonly evaluation?: PackagingEvaluationInput;
}

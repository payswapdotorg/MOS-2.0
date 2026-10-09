import type {
  StudioArtifactPackageId,
  StudioSessionId,
  StudioSessionLifecycleState,
  TenantId,
  TenantScope,
  Version,
} from '@mos/contracts';

/**
 * Studio session-directory view port (UX-002, over STUDIO-014).
 *
 * The Studio surface's READ side over the standalone studio product's
 * session-directory observation port: it lists the studio sessions of one
 * tenant scope with their lifecycle states (spec §13 standalone flow —
 * requested → loading → capturing → processing → review → packaged, plus the
 * closed/abandoned/failed terminals) and loads one session's operator-facing
 * detail — participants with their §15 multi-account consent states, the
 * append-only lifecycle history, the §30-attributable review records and the
 * §15 live consent re-resolution verdicts that gate forward-moving operator
 * actions.
 *
 * This is a VIEW port, not a domain port (module registry: `web` → authority
 * `presentation-only`, dependencies `[contracts]`): every type below is a
 * presentation-shaped view model re-declared from the STUDIO-014 operator
 * port shapes, importing only `@mos/contracts` types. The composition seam
 * OUTSIDE `src/` (`testing/`) adapts the real studio records into these
 * models; a server-side composition binds the same port over the MOS service
 * transport later without touching this file.
 *
 * The surface holds NO operator actions: reviews, treatments and captures are
 * studio-authority actions this view never performs or fakes — it renders the
 * recorded state only (the studio never publishes; packages show hand-off
 * state only).
 */

/**
 * Session lifecycle states as presented — the canonical `@mos/contracts`
 * union re-exported under its view name (requested → loading → capturing →
 * processing → review → packaged; closed/abandoned/failed terminal).
 */
export type StudioSessionLifecycleStateView = StudioSessionLifecycleState;

/** One session as it appears in the directory listing (§31: tenant explicit). */
export interface StudioSessionSummaryView {
  readonly sessionId: StudioSessionId;
  /** The tenant the session belongs to — always explicit, never ambient. */
  readonly tenantId: TenantId;
  /** Format of the session (reaction, audio-podcast, video-podcast). */
  readonly formatId: string;
  readonly formatVersion: number;
  readonly lifecycleState: StudioSessionLifecycleStateView;
  readonly createdAt: string;
  readonly participantCount: number;
  /** The versioned organization the session loaded (§16 org decision points). */
  readonly organizationRef: { readonly id: string; readonly version: number };
  /** The packaged artifact version, once the session packaged one. */
  readonly artifactPackageRef: {
    readonly packageId: StudioArtifactPackageId;
    readonly version: Version;
  } | null;
}

/** One append-only lifecycle transition as presented (history never rewritten). */
export interface StudioSessionTransitionView {
  readonly from: StudioSessionLifecycleStateView;
  readonly to: StudioSessionLifecycleStateView;
  /** ISO-8601 timestamp of the transition. */
  readonly at: string;
  /** Why the transition happened, when attributable. */
  readonly reason: string | null;
}

/**
 * §15 multi-account consent states as presented. `granted` = the live
 * consent re-resolution covers the participant's contribution; `pending` =
 * consent refs are recorded but coverage is not (yet) complete — the session
 * waits on consent; `consent-required` = the live re-resolution FAILED
 * (revoked or missing) and forward-moving operator actions are refused
 * fail-closed until consent is restored.
 */
export type StudioConsentStateView = 'granted' | 'pending' | 'consent-required';

/**
 * One participant of a session as presented. Per §15 every participant
 * RETAINS identity, account boundary and consent as separate explicit fields
 * — credentials are never merged, and the surface shows each account
 * boundary distinctly.
 */
export interface StudioParticipantView {
  readonly participantId: string;
  readonly identityRef: string;
  /** The participant's OWN account boundary (§15 — never a merged credential). */
  readonly accountRef: string;
  /** Roles held in the session (interviewer, subject, operator, observer). */
  readonly roles: readonly string[];
  /** Live §15 consent state for this participant's contribution. */
  readonly consentState: StudioConsentStateView;
  /** Join-time gate verdicts (the authority's recorded coverage). */
  readonly coversCapture: boolean;
  readonly coversProcessingIntoArtifacts: boolean;
  /** Consent records backing the state (audit display). */
  readonly consentRefs: readonly string[];
}

/**
 * WHO issued a review decision, as presented (§30 attribution). The actor
 * kind is the studio decision-actor vocabulary; `ref` is the lab candidate
 * or identity reference.
 */
export interface StudioDecisionActorView {
  readonly kind: 'lab' | 'standalone-user' | 'studio-operator';
  readonly ref: string;
}

/**
 * A §30-attributable review record as presented: who decided, what was
 * decided, when, over which artifact — recorded append-only by the studio
 * authority; the surface renders it and never edits it.
 */
export interface StudioReviewRecordView {
  /** The §19 review outcome (accept, reject-quality, reject-rights-policy, …). */
  readonly outcome: string;
  readonly decidedBy: StudioDecisionActorView;
  /** ISO-8601 timestamp of the decision. */
  readonly decidedAt: string;
  /** The artifact version the decision targeted. */
  readonly targetArtifactId: string;
  /**
   * Structured rejection detail — `null` unless the outcome is a rejection.
   * Quality and rights/policy rejections are DISTINCT kinds (§19): they have
   * different remedies and render differently.
   */
  readonly rejection: {
    readonly kind: 'quality-rejection' | 'rights-policy-rejection';
    /** Presentation summary (failed criteria / violation references). */
    readonly detail: string;
  } | null;
}

/**
 * A §15 live consent re-resolution verdict that currently BLOCKS a session:
 * the holder's consent no longer covers processing into artifacts, so every
 * forward-moving operator action is refused with the typed
 * `consent-required-for-operator-action` failure. Rendered as an actionable
 * state — the surface names the subject and what is required; it never hides
 * the verdict and never performs the consent change itself.
 */
export interface StudioConsentRequirementView {
  /** Whether the consenting subject is a session participant or an imported source holder. */
  readonly subjectKind: 'participant' | 'imported-source';
  readonly subjectIdentityRef: string;
  /** The raw artifact whose consent coverage failed re-resolution. */
  readonly artifactId: string;
  /** The recorded consent refs (the coverage that no longer resolves). */
  readonly consentRefs: readonly string[];
  /** Presentation message naming the required action. */
  readonly message: string;
}

/** A session's operator-facing detail as presented by the directory. */
export interface StudioSessionDetailView {
  readonly summary: StudioSessionSummaryView;
  /** Append-only lifecycle transitions in order. */
  readonly transitions: readonly StudioSessionTransitionView[];
  /** Participants with their §15 account boundaries and consent states. */
  readonly participants: readonly StudioParticipantView[];
  /** §30-attributable review records (append-only). */
  readonly reviews: readonly StudioReviewRecordView[];
  /** Live §15 verdicts currently gating forward-moving operator actions. */
  readonly consentRequirements: readonly StudioConsentRequirementView[];
}

/** Typed failure shapes for the directory port. */
export type StudioDirectoryFailure =
  | { readonly error: 'studio-directory-unavailable'; readonly message: string }
  | { readonly error: 'studio-session-not-found'; readonly message: string };

/**
 * The declared Studio session-directory view surface (read-only). Async by
 * design: the production binding is a service call, so loading and failure
 * states are part of the contract — never placeholders.
 */
export interface StudioDirectoryPort {
  /**
   * Latest summaries of every studio session visible in one tenant scope
   * (§31 — cross-tenant sessions are never listed or leaked).
   */
  listStudioSessions(
    scope: TenantScope,
  ): Promise<readonly StudioSessionSummaryView[] | StudioDirectoryFailure>;

  /**
   * One session's operator-facing detail, or `studio-session-not-found` for
   * unknown/cross-tenant ids (no existence leak across tenants).
   */
  loadStudioSessionDetail(
    sessionId: StudioSessionId,
    scope: TenantScope,
  ): Promise<StudioSessionDetailView | StudioDirectoryFailure>;
}

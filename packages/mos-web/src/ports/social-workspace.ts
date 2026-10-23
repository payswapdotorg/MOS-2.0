/**
 * Social Media workspace view port (the UXR social wave, over the frozen
 * SOCIAL-002..006 provider profiles + the guided-setup read model).
 *
 * Presentation-only (WEB-001 discipline): imports ONLY own shell types. The
 * composition root injects the read models; nothing here fabricates. The
 * port carries NO capability verdicts of its own — every supported /
 * unsupported / unknown verdict arrives from the composition binding, which
 * renders the frozen provider profile DATA verbatim. `unknown` is a
 * FIRST-CLASS verdict (the INTEG-001 vocabulary): it is never coerced to a
 * boolean, never rendered as supported, and never silently dropped.
 *
 * AUTHORITY DISCIPLINE: this port is READ-ONLY. The workspace's only
 * write-shaped action is the setup-details form's create-mission INTENT
 * declaration, which flows through the EXISTING
 * {@link MissionCatalogPort.declareCreateMissionIntent} transport (the
 * Missions authority owns the record); connecting a real platform account
 * is NOT available in this release and the read model says so honestly
 * through {@link SocialConnectVerdictView} — no credentials exist anywhere
 * in this composition, so no connect action is ever rendered as live.
 */

/* ---------- capability verdicts (verbatim from the frozen profiles) ---------- */

/**
 * The capability-support vocabulary as presented (mirrors the INTEG-001
 * `CapabilitySupportLevel` closed vocabulary — the same three states the
 * Connections surface renders; parity is never assumed and `unknown` is
 * preserved first-class).
 */
export type SocialCapabilitySupportView = 'supported' | 'unsupported' | 'unknown';

/**
 * ONE capability verdict for ONE closed-vocabulary social operation, as the
 * composition derived it from the provider profile DATA. The note is the
 * profile's own claim basis — rendered verbatim, never paraphrased into a
 * stronger claim.
 */
export interface SocialCapabilityVerdictView {
  /** The closed-vocabulary operation id (`publish`, `schedule`, …). */
  readonly operation: string;
  readonly support: SocialCapabilitySupportView;
  /** The profile's claim-basis note, when it carries one. */
  readonly note: string | null;
}

/* ---------- connect availability (honest for this release) ---------- */

/**
 * Whether the workspace can START a real account/source connection through
 * this composition. `unavailable` names why — this release binds no OAuth
 * transport and no credentials exist anywhere, so the verdict (not a
 * disabled button pretending to exist) carries the meaning.
 */
export type SocialConnectVerdictView =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/* ---------- the guided-setup read model ---------- */

/**
 * One guided-setup step's HONEST state. Steps advance ONLY on real
 * completion signals (navigation to the owning surface plus an authority
 * receipt where a declare exists) — the composition derives the state from
 * what actually happened; a fresh workspace reports every step
 * `not-started`, never a guessed `in-progress`.
 */
export type SocialGuidedStepState = 'not-started' | 'in-progress' | 'complete';

/** One guided-setup checklist step (the target design's five steps). */
export interface SocialGuidedStepView {
  /** Position in the checklist (1..5). */
  readonly position: number;
  /** The step's label (target design copy, e.g. `1. Choose goal`). */
  readonly label: string;
  /** One-line hint under the label. */
  readonly hint: string;
  /** The DERIVED state — honest, never optimistic. */
  readonly state: SocialGuidedStepState;
  /** What advances this step (the completion signal, named honestly). */
  readonly completionSignal: string;
}

/** One honest status row of the simulation sandbox panel. */
export interface SocialSandboxStatusRowView {
  /** Row label (e.g. `Audience / market`). */
  readonly label: string;
  /** Honest value line (e.g. `Declared by user`). */
  readonly value: string;
  /** App-internal route that owns the row's evidence, when one exists. */
  readonly sourceRoute: string | null;
}

/**
 * The simulation sandbox read model: the SANDBOX boundary copy and its
 * status rows. Every value is a labelled simulation/declaration — never a
 * platform fact, never invented analytics.
 */
export interface SocialSimulationSandboxView {
  /** The panel title (target copy: `Simulation workspace — SANDBOX`). */
  readonly title: string;
  /** The boundary line (target copy, verbatim). */
  readonly boundary: string;
  readonly statusRows: readonly SocialSandboxStatusRowView[];
}

/**
 * The guided-setup read model for ONE platform: the five checklist steps
 * with their derived states, the mission-context link (where the declared
 * mission objective lives), and the simulation-sandbox status.
 */
export interface SocialGuidedSetupView {
  /** The owning platform (canonical provider id). */
  readonly providerId: string;
  readonly guidedSteps: readonly SocialGuidedStepView[];
  /**
   * Where the workspace's declared mission context lives, when the
   * composition can link one (`null` = no mission context resolved — an
   * honest absence, never a guessed route).
   */
  readonly missionContext: { readonly route: string; readonly note: string } | null;
  readonly simulationSandbox: SocialSimulationSandboxView;
}

/* ---------- the platform read model ---------- */

/**
 * ONE social platform as the workspace presents it: the frozen profile's
 * identity + capability matrix (VERBATIM verdicts), the auth-model KIND
 * declaration (never credentials), the coarse operation shapes, the guided
 * setup read model, and the honest connect verdict for this release.
 */
export interface SocialPlatformView {
  /** Canonical provider id (e.g. `provider:youtube`). */
  readonly providerId: string;
  /** Route slug (`youtube`) for `/social?platform=<slug>`. */
  readonly slug: string;
  /** Human-facing platform name. */
  readonly displayName: string;
  /** Whether this platform is the composition's DEFAULT selection. */
  readonly selected: boolean;
  /** The frozen profile's capability matrix, verdict for verdict. */
  readonly capabilityVerdicts: readonly SocialCapabilityVerdictView[];
  /** The auth-model KIND declaration (`oauth2`, …) — a kind, never a credential. */
  readonly authModelKind: string;
  /** The publicly-known auth flow kinds the profile declares. */
  readonly authFlows: readonly string[];
  /** The profile's overall evidence-basis statement (rendered verbatim). */
  readonly evidenceBasis: string;
  /** The coarse operation-shape labels the profile declares (data). */
  readonly operationShapes: readonly string[];
  /**
   * The platform's PUBLIC home-page URL (presentation copy for the guided
   * browser pane's default target — the well-known public site, NOT an API
   * endpoint claim; the frozen profiles deliberately declare no endpoint
   * URLs). `null` when no public home page is declared.
   */
  readonly publicSiteUrl: string | null;
  /** Whether this release can start a real connection — honestly. */
  readonly connectVerdict: SocialConnectVerdictView;
  /** The guided-setup read model for this platform. */
  readonly guidedSetup: SocialGuidedSetupView;
}

/** The whole Social Media workspace read model. */
export interface SocialWorkspaceView {
  /** The supported platforms in rail order (YouTube first — the default). */
  readonly platforms: readonly SocialPlatformView[];
}

/** Typed failure shape for {@link SocialWorkspacePort.loadSocialWorkspace}. */
export interface SocialWorkspaceLoadFailure {
  readonly error: 'social-workspace-unavailable';
  readonly message: string;
}

/**
 * The declared Social workspace surface (read-only): one load returns the
 * platform rail with every frozen-profile verdict verbatim and the
 * guided-setup states the composition can honestly derive.
 */
export interface SocialWorkspacePort {
  loadSocialWorkspace(): Promise<SocialWorkspaceView | SocialWorkspaceLoadFailure>;
}

/**
 * Social workspace presentation data (the UXR social wave) — the target
 * design's copy, verbatim where the target states it
 * (docs/handoff/assets/mos-social-youtube-setup-target.svg — "Reference
 * only • embedded browser uses supported substrate or secure system-browser
 * fallback • all simulated results remain labelled").
 *
 * This module is PRESENTATION DATA ONLY (the LAB_*_LABELS discipline):
 * static strings the social views render; every capability verdict, step
 * state and sandbox status arrives through the workspace read model and is
 * never defaulted here.
 */

/** The "Important distinction" callout (target copy, verbatim shape). */
export const SOCIAL_DISTINCTION_TITLE = 'Important distinction';

/** The callout body — the platform name is the read model's own display name. */
export function socialDistinctionBody(displayName: string): string {
  return `Connecting a real ${displayName} source is different from simulating strategy outcomes. No content is published in this setup flow.`;
}

/** Guided-setup panel heading + note (target copy). */
export const SOCIAL_GUIDED_SETUP_TITLE = 'Guided setup';
export const SOCIAL_GUIDED_SETUP_NOTE = 'Your agent keeps context at each step.';

/** AGENT GUIDE panel (target copy, verbatim). */
export const SOCIAL_AGENT_GUIDE_TITLE = 'AGENT GUIDE';
export const SOCIAL_AGENT_GUIDE_QUOTE =
  '“We can start with public or user-provided sources. If you connect an account, the app will use only approved scopes.”';

/** The follow-up affordance (target copy; the link is the console's text direct mode). */
export const SOCIAL_ASK_FOLLOWUP_LABEL = 'Ask a follow-up question';
export const SOCIAL_ASK_FOLLOWUP_NOTE = 'Voice or text supported where available';
export const SOCIAL_ASK_FOLLOWUP_DISCLOSURE =
  'Follow-up questions open the Agent Console in direct mode — text today; voice input is not wired in this release, so the note stays “where available”, never a claim.';

/** "Start with the task, not a login" (target copy, verbatim). */
export const SOCIAL_TASK_FIRST_TITLE = 'Start with the task, not a login';
export const SOCIAL_TASK_FIRST_BODY =
  'Public research and simulated strategy planning can begin without connecting an account.';

/** The two path cards (target copy, verbatim). */
export const SOCIAL_RESEARCH_PATH_TITLE = 'Research a channel';
export const SOCIAL_RESEARCH_PATH_BODY =
  'Use authorized data, public sources, and user-provided context to map audience questions and content themes.';
export const SOCIAL_RESEARCH_PATH_ACTION = 'Open research path ↗';
export const SOCIAL_SIMULATION_PATH_TITLE = 'Create a simulation';
export const SOCIAL_SIMULATION_PATH_BODY =
  'Declare audience, offer, content formats, resource bounds and time horizon; compare hypotheses later.';
export const SOCIAL_SIMULATION_PATH_ACTION = 'Configure simulation ↗';

/** The simulation sandbox panel (target copy, VERBATIM — the lock-rule labels). */
export const SOCIAL_SANDBOX_TITLE = 'Simulation workspace — SANDBOX';
export const SOCIAL_SANDBOX_BOUNDARY = 'No live publish • no invented analytics • no account changes';
export const SOCIAL_SANDBOX_SIMULATED_CHIP = 'SIMULATION — synthetic values, never platform facts';

/** Setup details inspector (target copy). */
export const SOCIAL_SETUP_DETAILS_TITLE = 'Setup details';
export const SOCIAL_SETUP_DETAILS_NOTE = 'The agent carries this into every step.';
export const SOCIAL_SETUP_PERSISTENCE_NOTES: readonly string[] = [
  'Guided steps persist',
  'Capabilities verified by provider',
  'No side effects without approval',
];
export const SOCIAL_CONTINUE_LABEL = 'Continue setup →';

/** The guided browser pane (target copy). */
export const SOCIAL_BROWSER_PANE_TITLE = 'MOS guided browser';
export const SOCIAL_BROWSER_SECURITY_NOTE =
  'Secure provider route — MOS never asks for your password here; sign-in stays with the provider';
export const SOCIAL_BROWSER_EMBEDDED_NOTE =
  'Some providers block embedded sign-in: use Open externally for those';
export const SOCIAL_BROWSER_RETURN_LABEL = 'Return to MOS';
export const SOCIAL_BROWSER_FALLBACK_TITLE = 'The guided browser is available in the MOS desktop app';
export const SOCIAL_BROWSER_FALLBACK_NOTE =
  'This shell run has no embedded provider view — the pane renders this verdict instead of a placeholder frame.';

/**
 * Capability verdict presentation: the THREE states render DISTINCTLY and
 * `unknown` is never coerced into a boolean or a softer word — the label is
 * the verdict, the badge class is the state (test-pinned).
 */
export const SOCIAL_VERDICT_LABELS: Readonly<
  Record<'supported' | 'unsupported' | 'unknown', string>
> = Object.freeze({
  supported: 'supported',
  unsupported: 'unsupported — fails closed',
  unknown: 'unknown — observation-pending',
});

/** Guided-setup step badge presentation per DERIVED state (never optimistic). */
export const SOCIAL_STEP_STATE_LABELS: Readonly<
  Record<'not-started' | 'in-progress' | 'complete', string>
> = Object.freeze({
  'not-started': 'not started',
  'in-progress': 'in progress',
  complete: 'complete',
});

/** One-line honest capability summary for the platform rail (derived, not stored). */
export function socialRailCapabilitySummary(
  publish: 'supported' | 'unsupported' | 'unknown',
  restrictions: 'supported' | 'unsupported' | 'unknown',
): string {
  return `Publishing ${publish} · Restrictions ${restrictions}`;
}

/** The workspace header purpose line (target copy, verbatim). */
export const SOCIAL_WORKSPACE_PURPOSE =
  'Connect source data, or create a simulated content-strategy environment first.';

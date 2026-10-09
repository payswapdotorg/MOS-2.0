import type { CreationMethod } from '@mos/contracts';
import type {
  StudioConsentStateView,
  StudioSessionLifecycleStateView,
} from '../ports/studio-directory.js';
import type { StudioPackageEvaluationView } from '../ports/studio-packages.js';

/**
 * Studio presentation data (UX-002) — labels, badge classes and disclosure
 * copy for the Studio surface. PRESENTATION ONLY: nothing here implements,
 * decides or computes studio state; every label renders a verdict a view
 * port already carried (the studio authority owns the state itself).
 */

/** The nine session lifecycle states in §13 flow order (terminals last). */
export const STUDIO_SESSION_LIFECYCLE_STATES: readonly StudioSessionLifecycleStateView[] =
  Object.freeze([
    'requested',
    'loading',
    'capturing',
    'processing',
    'review',
    'packaged',
    'closed',
    'abandoned',
    'failed',
  ]);

/** Badge styling per lifecycle state (terminal states tint distinctly). */
export const STUDIO_LIFECYCLE_BADGE_CLASSES: Readonly<
  Record<StudioSessionLifecycleStateView, string>
> = Object.freeze({
  requested: 'bg-slate-700/60 text-slate-200',
  loading: 'bg-slate-700/60 text-slate-200',
  capturing: 'bg-sky-500/15 text-sky-300',
  processing: 'bg-sky-500/15 text-sky-300',
  review: 'bg-amber-500/15 text-amber-300',
  packaged: 'bg-emerald-500/15 text-emerald-300',
  closed: 'bg-slate-600/40 text-slate-300',
  abandoned: 'bg-slate-600/40 text-slate-300',
  failed: 'bg-red-500/15 text-red-300',
});

/** One-line presentation of a lifecycle state. */
export const STUDIO_LIFECYCLE_DESCRIPTIONS: Readonly<
  Record<StudioSessionLifecycleStateView, string>
> = Object.freeze({
  requested: 'Session created; waiting for its organization load to start.',
  loading: 'The versioned organization is being loaded and checked.',
  capturing: 'Participants are capturing raw material (§15 consent gates live).',
  processing: 'The organization is treating raw capture into artifacts.',
  review: 'Packaged candidate awaits an operator review decision.',
  packaged: 'An immutable artifact package version exists for this session.',
  closed: 'Terminal: the session ended after packaging.',
  abandoned: 'Terminal: the branch was abandoned and stays auditable.',
  failed: 'Terminal: the session ended in failure.',
});

/** Badge styling + label per §15 consent state. */
export const STUDIO_CONSENT_STATE_PRESENTATION: Readonly<
  Record<StudioConsentStateView, { readonly label: string; readonly badgeClass: string }>
> = Object.freeze({
  granted: {
    label: 'Consent granted',
    badgeClass: 'bg-emerald-500/15 text-emerald-300',
  },
  pending: {
    label: 'Consent pending',
    badgeClass: 'bg-amber-500/15 text-amber-300',
  },
  'consent-required': {
    label: 'Consent required',
    badgeClass: 'bg-red-500/15 text-red-300',
  },
});

/** Presentation labels for the initial studio formats (§13). */
export const STUDIO_FORMAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  reaction: 'Reaction',
  'audio-podcast': 'Audio podcast',
  'video-podcast': 'Video podcast',
});

/** Presentation of a format id the shell does not know: honest, not a guess. */
export function studioFormatLabel(formatId: string): string {
  return STUDIO_FORMAT_LABELS[formatId] ?? `Format ${formatId}`;
}

/** Presentation of a canonical creation method (§6/§14). */
export function studioCreationMethodLabel(method: CreationMethod): string {
  switch (method) {
    case 'human-capture':
      return 'Human capture';
    case 'human-import':
      return 'Human import';
    case 'engine-generated':
      return 'Engine-generated (synthetic)';
    case 'organization-transform':
      return 'Organization transform';
    case 'composition':
      return 'Composition';
  }
}

/**
 * True only for engine-generated material — the §14 synthetic provenance
 * mark. Synthetic content is VISIBLY labeled synthetic on this surface.
 */
export function isSyntheticCreationMethod(method: CreationMethod): boolean {
  return method === 'engine-generated';
}

/** Presentation of a §19 evaluation outcome (quality ≠ rights/policy). */
export function studioEvaluationOutcomeLabel(
  outcome: StudioPackageEvaluationView['outcome'],
): string {
  switch (outcome) {
    case 'accepted':
      return 'Accepted';
    case 'quality-rejected':
      return 'Rejected — quality';
    case 'rights-policy-rejected':
      return 'Rejected — rights/policy';
    case 'treatment-requested':
      return 'Treatment requested';
    case 'not-applicable':
      return 'Not yet applicable';
  }
}

/** Presentation of a §30 decision actor. */
export function studioDecisionActorLabel(actor: {
  readonly kind: 'lab' | 'standalone-user' | 'studio-operator';
  readonly ref: string;
}): string {
  switch (actor.kind) {
    case 'lab':
      return `Lab candidate ${actor.ref}`;
    case 'standalone-user':
      return `Standalone user ${actor.ref}`;
    case 'studio-operator':
      return `Studio operator ${actor.ref}`;
  }
}

/**
 * The standing no-publish / hand-off disclosure (§13, lock #28): the Studio
 * never publishes directly — its packages hand off through ports to the Lab
 * and distribution authorities. The surface shows hand-off state only.
 */
export const STUDIO_HANDOFF_NOTE =
  'The Studio never publishes. Packages hand off through ports to the Lab and distribution authorities — this surface shows hand-off state only.';

/**
 * The Studio surface's place in the §2 complete loop, as narrated in its
 * header (presentation data mirroring the Home narration discipline).
 */
export const STUDIO_LOOP_NARRATION = Object.freeze({
  position: 'Production loop — Studio stage of the §2 complete loop',
  summary:
    'The Content Studio produces the program’s media: standalone or Lab-requested sessions run a versioned organization over multi-account capture, and every output lands as an immutable, provenance-carrying artifact package.',
});

/**
 * UX-005 — presentation-only disclosure primitives. No ports, no view-model
 * changes, no hooks (the shell's HOOK-FREE view doctrine): native
 * `<details>/<summary>` carries the expanded state, keyboard operability and
 * the implicit ARIA semantics; explicit id wiring keeps the mechanics
 * pin-able. No react import in any form (the pin law: the JSX runtime is
 * compiler-emitted) — children are typed structurally.
 *
 * THE HOUSE LAW THIS MODULE ENCODES (the item's core criterion): disclosure
 * NEVER removes an honesty label. The summary layer renders the honesty
 * labels themselves — the collapsed DOM always carries them — and the
 * detail panels only ever ADD information.
 */

/**
 * Structural child type (ReactNode-shaped without the react import — the
 * pin law forbids every react import form in src): the JSX runtime accepts
 * text, numbers, element objects, nested arrays and holes; the render sites
 * pass the value through (`as never` — the house cast for runtime-true,
 * type-opaque seams).
 */
export type ViewNode = unknown;

export interface SummaryStatView {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'neutral' | 'positive' | 'caution' | 'negative';
}

export interface SummaryLayerProps {
  readonly surface: 'home' | 'missions' | 'studio' | 'lab' | 'connections' | 'notifications';
  readonly headline: string;
  readonly stats: readonly SummaryStatView[];
  /** Honesty labels — rendered ALWAYS, at every disclosure level. */
  readonly honestyLabels: readonly string[];
}

const STAT_TONE_CLASS: Readonly<Record<string, string>> = Object.freeze({
  neutral: 'ux005-stat ux005-stat--neutral',
  positive: 'ux005-stat ux005-stat--positive',
  caution: 'ux005-stat ux005-stat--caution',
  negative: 'ux005-stat ux005-stat--negative',
});

/** The one-glance summary layer (UX-005 criterion 2). */
export function SummaryLayer(props: SummaryLayerProps) {
  return (
    <section
      className="ux005-summary-layer"
      data-ux005-surface={props.surface}
      aria-label={`${props.surface} summary`}
    >
      <p className="ux005-summary-headline">{props.headline}</p>
      <ul className="ux005-summary-stats">
        {props.stats.map((s) => (
          <li key={s.label} className={STAT_TONE_CLASS[s.tone ?? 'neutral']}>
            <span className="ux005-stat-value">{s.value}</span>{' '}
            <span className="ux005-stat-label">{s.label}</span>
          </li>
        ))}
      </ul>
      {/* THE HONESTY-PRESERVATION LAW: these render at every level. */}
      <ul className="ux005-honesty-labels" data-ux005-honesty="true">
        {props.honestyLabels.map((label) => (
          <li key={label} className="ux005-honesty-label">{label}</li>
        ))}
      </ul>
    </section>
  );
}

export interface DisclosureItemProps {
  readonly id: string;
  readonly summary: ViewNode;
  readonly children: ViewNode;
  /** Default collapsed (the layering law); `true` is disclosed per-use. */
  readonly defaultOpen?: boolean;
}

/**
 * Per-item expandable detail. Native details/summary gives keyboard
 * operability (Enter/Space toggle the native control) and implicit ARIA
 * semantics for free — no hook state, no aria-expanded bookkeeping to drift.
 */
export function DisclosureItem(props: DisclosureItemProps) {
  return (
    <details
      className="ux005-disclosure-item"
      data-ux005-item={props.id}
      open={props.defaultOpen ?? false}
    >
      <summary className="ux005-disclosure-summary" id={`${props.id}-summary`}>
        {props.summary as never}
      </summary>
      <div
        className="ux005-disclosure-panel"
        id={`${props.id}-panel`}
        role="region"
        aria-labelledby={`${props.id}-summary`}
      >
        {props.children as never}
      </div>
    </details>
  );
}

/** The disclosure list wrapper (per-surface marker for pinning). */
export function DisclosureList(props: {
  readonly surface: string;
  readonly children: ViewNode;
}) {
  return (
    <div className="ux005-disclosure-list" data-ux005-list={props.surface}>
      {props.children as never}
    </div>
  );
}

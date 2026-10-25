/**
 * The MOS console shared section primitives (W32 — presentation-only,
 * hook-free: state arrives via props, commands leave through callbacks;
 * the shell entry owns every store subscription and re-mounts on change).
 *
 * The scaffold every console section renders (identity: title + purpose
 * VERBATIM from the nav vocabulary), the status pill vocabulary, the
 * clearly-labelled REFERENCE card (vocabulary renders as reference,
 * never as live data), the standard content card, and the honest typed
 * empty state.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';

/**
 * Structural child type (ReactNode-shaped without the react import — the
 * pin law forbids every react import form in src/): the JSX runtime
 * accepts text, numbers, element objects, nested arrays and holes; the
 * render sites pass the value through (`as never` — the house cast for
 * runtime-true, type-opaque seams, mirroring @mos/web's ViewNode).
 */
type ViewNode = unknown;

/** The per-section scaffold: an accessible section + title + purpose. */
export function SectionScaffold({
  section,
  headerAside,
  children,
}: {
  readonly section: MosConsoleSectionRecord;
  /** Optional right-side element in the header row (e.g. a status pill). */
  readonly headerAside?: ViewNode;
  readonly children: ViewNode;
}) {
  const headingId = `mosc-${section.id}-heading`;
  return (
    <section aria-labelledby={headingId} className="mosc-section" data-testid={`mosc-section-${section.id}`}>
      <header className={headerAside !== undefined ? 'mosc-section-header mosc-section-header--aside' : 'mosc-section-header'}>
        <div className="mosc-section-header-main">
          <p className="mosc-eyebrow">MOS Agent Workspace</p>
          <h1 id={headingId} className="mosc-section-title">
            {section.title}
          </h1>
          <p className="mosc-section-lede">{section.purpose}</p>
        </div>
        {headerAside as never}
      </header>
      {children as never}
    </section>
  );
}

/** The status pill tones (the parallel-token law: emerald=ok, amber=attention/unknown, red=failure, slate=neutral). */
export type MoscPillTone = 'ok' | 'attention' | 'unknown' | 'failure' | 'neutral' | 'simulation' | 'info';

/** A status pill — typed state, rendered as text (never a color-only signal). */
export function StatusPill({ tone, children }: { readonly tone: MoscPillTone; readonly children: ViewNode }) {
  return <span className={`mosc-pill mosc-pill--${tone}`}>{children as never}</span>;
}

/** One vocabulary term inside a reference card (term + the honest line). */
export interface MoscReferenceTerm {
  readonly term: string;
  readonly line: string;
}

/**
 * The clearly-labelled REFERENCE card: vocabulary terms render here as
 * reference — the pill says so, the tone stays neutral, and nothing in
 * it is live data. The six authority sections (Lab, Agent Console,
 * Studio, Distribution, Experiments, Measurement) render their
 * capability vocabulary through this card.
 */
export function ReferenceCard({
  id,
  title,
  note,
  terms,
}: {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly terms: readonly MoscReferenceTerm[];
}) {
  const headingId = `${id}-heading`;
  return (
    <article className="mosc-card mosc-reference" id={id}>
      <div className="mosc-card-head">
        <h2 id={headingId} className="mosc-card-title">
          {title}
        </h2>
        <StatusPill tone="neutral">Reference</StatusPill>
      </div>
      <p className="mosc-card-note">{note}</p>
      <dl className="mosc-reference-list">
        {terms.map((term) => (
          <div key={term.term} className="mosc-reference-row">
            <dt className="mosc-reference-term">{term.term}</dt>
            <dd className="mosc-reference-line">{term.line}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** A standard console content card (title + note + body). */
export function ConsoleCard({
  id,
  title,
  note,
  aside,
  children,
  testId,
}: {
  readonly id?: string;
  readonly title: string;
  readonly note?: string;
  readonly aside?: ViewNode;
  readonly children?: ViewNode;
  readonly testId?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;
  return (
    <article className="mosc-card" id={id} data-testid={testId}>
      <div className="mosc-card-head">
        <h2 id={headingId} className="mosc-card-title">
          {title}
        </h2>
        {aside as never}
      </div>
      {note !== undefined ? <p className="mosc-card-note">{note}</p> : null}
      {children as never}
    </article>
  );
}

/** The honest typed empty state: the typed reason + a REAL next action. */
export function ConsoleEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) {
  return (
    <div className="mosc-empty" role="status">
      <p className="mosc-empty-title">{title}</p>
      <p className="mosc-empty-description">{description}</p>
      {actionLabel !== undefined && onAction !== undefined ? (
        <button type="button" className="mosc-button mosc-button--primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** The honest disclosure line (the small-print honesty marker under a card). */
export function HonestyLine({ children }: { readonly children: ViewNode }) {
  return <p className="mosc-honesty-line">{children as never}</p>;
}

/** A form field wrapper: label + control + optional hint. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly children: ViewNode;
}) {
  return (
    <div className="mosc-field">
      <label className="mosc-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children as never}
      {hint !== undefined ? <p className="mosc-field-hint">{hint}</p> : null}
    </div>
  );
}

/** The receipt line after a recorded action (the authority's honest echo). */
export function ReceiptLine({ children, tone = 'ok' }: { readonly children: ViewNode; readonly tone?: MoscPillTone }) {
  return (
    <p className={`mosc-receipt mosc-receipt--${tone}`} role="status" data-testid="mosc-receipt">
      {children as never}
    </p>
  );
}

/** Format an ISO-ish timestamp for the timeline rows (local, readable). */
export function formatWhen(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return at; // honest passthrough — never a fabricated "now"
  }
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

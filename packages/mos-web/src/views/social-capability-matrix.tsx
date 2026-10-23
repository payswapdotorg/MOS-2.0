import type {
  SocialCapabilitySupportView,
  SocialCapabilityVerdictView,
  SocialConnectVerdictView,
  SocialPlatformView,
} from '../ports/social-workspace.js';
import {
  SOCIAL_VERDICT_LABELS,
} from './social-presentation.js';

/**
 * The per-platform capability matrix panel (the UXR social wave): every
 * closed-vocabulary operation's verdict rendered VERBATIM from the read
 * model — supported / unsupported / unknown are three DISTINCT states and
 * `unknown` never renders as a boolean, a blank or a softer word
 * (test-pinned). The auth-model KIND (never credentials), the coarse
 * operation shapes and the profile's evidence basis render alongside, plus
 * the honest connect verdict for THIS release.
 *
 * Presentation-only: no verdict is computed, coerced or defaulted here.
 */

const VERDICT_BADGE_CLASSES: Readonly<Record<SocialCapabilitySupportView, string>> = Object.freeze(
  {
    supported: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    unsupported: 'bg-rose-100 text-rose-800 border-rose-200',
    unknown: 'bg-amber-100 text-amber-800 border-amber-200',
  },
);

function verdictOf(
  verdicts: readonly SocialCapabilityVerdictView[],
  operation: string,
): SocialCapabilityVerdictView | null {
  return verdicts.find((verdict) => verdict.operation === operation) ?? null;
}

function VerdictRow({
  verdict,
}: {
  readonly verdict: SocialCapabilityVerdictView;
}) {
  return (
    <tr data-testid={`social-verdict-row-${verdict.operation}`}>
      <th
        scope="row"
        className="border-b border-slate-100 py-1.5 pr-3 text-left text-xs font-medium text-slate-600"
      >
        {verdict.operation}
      </th>
      <td className="border-b border-slate-100 py-1.5 pr-3">
        <span
          className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_BADGE_CLASSES[verdict.support]}`}
          data-support={verdict.support}
          data-testid={`social-verdict-${verdict.operation}`}
        >
          {SOCIAL_VERDICT_LABELS[verdict.support]}
        </span>
      </td>
      <td className="border-b border-slate-100 py-1.5 text-[11px] leading-snug text-slate-500">
        {verdict.note ?? '—'}
      </td>
    </tr>
  );
}

/** The connect-verdict panel — `unavailable` is the verdict, never a disabled pretence. */
function ConnectVerdictPanel({
  platform,
  verdict,
}: {
  readonly platform: SocialPlatformView;
  readonly verdict: SocialConnectVerdictView;
}) {
  if (verdict.kind === 'available') {
    return null;
  }
  return (
    <aside
      aria-labelledby={`social-connect-${platform.slug}-title`}
      className="rounded-lg border border-amber-200 bg-amber-50 p-3"
      data-testid={`social-connect-verdict-${platform.slug}`}
    >
      <h4
        id={`social-connect-${platform.slug}-title`}
        className="text-xs font-semibold text-amber-800"
      >
        Connecting a real {platform.displayName} account is unavailable in this release
      </h4>
      <p className="mt-1 text-[11px] leading-snug text-amber-800">{verdict.reason}</p>
      <p className="mt-1 text-[11px] leading-snug text-amber-700">
        Source access requires the production service transport — unavailable in this release. The
        guided browser pane beside this matrix reaches PUBLIC provider pages only; it never
        captures credentials.
      </p>
    </aside>
  );
}

/**
 * The selected platform's capability matrix: verdict table + auth KIND +
 * operation shapes + evidence basis + the honest connect verdict.
 */
export function SocialCapabilityMatrix({
  platform,
}: {
  readonly platform: SocialPlatformView;
}) {
  const publishVerdict = verdictOf(platform.capabilityVerdicts, 'publish');
  return (
    <section
      aria-labelledby={`social-capability-${platform.slug}-title`}
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid={`social-capability-matrix-${platform.slug}`}
    >
      <h3
        id={`social-capability-${platform.slug}-title`}
        className="text-sm font-semibold text-slate-900"
      >
        {platform.displayName} capabilities — verified by provider profile
      </h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Every verdict below is the frozen provider profile's own declaration (the
        social-distribution authority's DATA) — this workspace renders them verbatim and never
        upgrades an unknown into a claim.
      </p>
      <table className="mt-3 w-full border-collapse text-left">
        <caption className="sr-only">
          {platform.displayName} capability matrix, one row per closed-vocabulary operation
        </caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400">
            <th scope="col" className="pb-1 pr-3 text-left font-semibold">
              Operation
            </th>
            <th scope="col" className="pb-1 pr-3 text-left font-semibold">
              Verdict
            </th>
            <th scope="col" className="pb-1 text-left font-semibold">
              Claim basis
            </th>
          </tr>
        </thead>
        <tbody>
          {platform.capabilityVerdicts.map((verdict) => (
            <VerdictRow key={verdict.operation} verdict={verdict} />
          ))}
        </tbody>
      </table>
      <dl className="mt-3 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="font-semibold text-slate-600">Auth model (kind):</dt>
          <dd data-testid={`social-auth-model-${platform.slug}`}>
            {platform.authModelKind} — flows: {platform.authFlows.join(', ')} (a KIND declaration,
            never credentials; escrowed at the integrations boundary)
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-semibold text-slate-600">Operation shapes:</dt>
          <dd data-testid={`social-operation-shapes-${platform.slug}`}>
            {publishVerdict === null
              ? platform.operationShapes.join(', ')
              : platform.operationShapes.length > 0
                ? platform.operationShapes.join(', ')
                : 'none declared for the supported artifact-carrying operations'}
          </dd>
        </div>
      </dl>
      <details className="mt-2 rounded border border-slate-200 px-2 py-1.5">
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-600">
          Evidence basis (the profile's own statement, verbatim)
        </summary>
        <p className="mt-1 text-[11px] leading-snug text-slate-500" data-testid={`social-evidence-basis-${platform.slug}`}>
          {platform.evidenceBasis}
        </p>
      </details>
      <div className="mt-3">
        <ConnectVerdictPanel platform={platform} verdict={platform.connectVerdict} />
      </div>
    </section>
  );
}

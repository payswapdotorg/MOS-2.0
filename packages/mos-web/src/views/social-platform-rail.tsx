import type { SocialPlatformView } from '../ports/social-workspace.js';
import { socialRailCapabilitySummary } from './social-presentation.js';

/**
 * The Social workspace's platform picker rail (the UXR social wave): the
 * supported platforms in rail order, the selected platform as the house
 * navy pill, and ONE honest capability-summary line per platform derived
 * from the read model's own verdicts (never stored, never guessed). The
 * rail renders REAL LINKS (`/social?platform=<slug>`) — one route per
 * load, the house navigation discipline; there is no client route state.
 */

/** Decorative platform glyphs (inline SVG, aria-hidden — labels carry meaning). */
const PLATFORM_GLYPH_PATHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  youtube: ['M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z', 'M10 9l6 3-6 3z'],
  instagram: ['M4 4h16v16H4z', 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0', 'M16.5 7.5h.01'],
  'facebook-pages': ['M14 8h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3h2.5v6h3v-6H16l.5-3h-3V8.8c0-.5.3-.8.5-.8z'],
  tiktok: ['M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5', 'M14 5.5A4.5 4.5 0 0 0 18.5 9'],
  x: ['M5 5l14 14', 'M19 5L5 19'],
});

function PlatformGlyph({ slug }: { readonly slug: string }) {
  const paths = PLATFORM_GLYPH_PATHS[slug];
  if (paths === undefined) {
    return null;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function verdictSupportOf(
  platform: SocialPlatformView,
  operation: string,
): 'supported' | 'unsupported' | 'unknown' {
  return platform.capabilityVerdicts.find((verdict) => verdict.operation === operation)
    ?.support ?? 'unknown';
}

/** The platform picker rail (nav landmark — five platforms, one selected). */
export function SocialPlatformRail({
  platforms,
  selectedSlug,
}: {
  readonly platforms: readonly SocialPlatformView[];
  /** The EFFECTIVE selection (route slug or the composition default). */
  readonly selectedSlug: string;
}) {
  return (
    <nav
      aria-label="Social platforms"
      className="rounded-lg border border-slate-200 bg-white p-3"
      data-testid="social-platform-rail"
    >
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Platforms
      </p>
      <ul className="flex flex-row flex-wrap gap-1 lg:flex-col">
        {platforms.map((platform) => {
          const selected = platform.slug === selectedSlug;
          const summary = socialRailCapabilitySummary(
            verdictSupportOf(platform, 'publish'),
            verdictSupportOf(platform, 'list-restrictions'),
          );
          return (
            <li key={platform.providerId} className="lg:w-full">
              <a
                href={`/social?platform=${encodeURIComponent(platform.slug)}`}
                aria-current={selected ? 'page' : undefined}
                className={`flex items-start gap-2.5 rounded-md px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy ${
                  selected
                    ? 'bg-mos-navy text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                data-testid={`social-platform-${platform.slug}`}
              >
                <span className="mt-0.5">
                  <PlatformGlyph slug={platform.slug} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">
                    {platform.displayName}
                    {selected ? <span className="sr-only"> (selected platform)</span> : null}
                  </span>
                  <span
                    className={`text-[11px] leading-snug ${selected ? 'text-slate-200' : 'text-slate-500'}`}
                    data-testid={`social-platform-summary-${platform.slug}`}
                  >
                    {summary}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-1 text-[11px] leading-snug text-slate-500">
        Capability summaries are the provider profiles' own verdicts; every platform's full matrix
        renders on selection.
      </p>
    </nav>
  );
}

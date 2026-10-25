/**
 * The MOS console WORKSPACE VOCABULARY (W32): the frozen constants the
 * console renders from — the 17-metric reward vocabulary (verbatim from
 * the Missions authority), the mission directions, the social + ad
 * platform lists, the five-platform capability matrix (support verdicts
 * verbatim from the frozen provider profiles), and the 8-entry provider
 * catalogue with the credentials-law expected domains.
 *
 * Pure data, no imports: directly consumable by the node test runner
 * through the package's built dist.
 */

/** The mission directions (the typed action set's counterparts). */
export const MOS_MISSION_DIRECTIONS = ['promote', 'publish', 'grow', 'measure'] as const;
export type MosMissionDirection = (typeof MOS_MISSION_DIRECTIONS)[number];

/** The social platforms (the five-platform workspace, rail order). */
export const MOS_SOCIAL_PLATFORMS = ['youtube', 'instagram', 'facebook-pages', 'tiktok', 'x'] as const;
export type MosSocialPlatformId = (typeof MOS_SOCIAL_PLATFORMS)[number];

/** The ad platforms (the paid-promotion catalogue). */
export const MOS_AD_PLATFORMS = ['google-ads', 'meta-ads', 'tiktok-ads'] as const;
export type MosAdPlatformId = (typeof MOS_AD_PLATFORMS)[number];

/**
 * The 17-metric reward vocabulary — verbatim from the Missions authority
 * (composition/production-mission-catalog.ts REWARD_METRIC_VOCABULARY).
 * The console renders this list; it never invents a metric.
 */
export const MOS_REWARD_METRIC_VOCABULARY: readonly {
  readonly id: string;
  readonly label: string;
}[] = [
  { id: 'business-outcome', label: 'Business outcome' },
  { id: 'qualified-reach', label: 'Qualified reach' },
  { id: 'retention', label: 'Retention' },
  { id: 'audience-growth', label: 'Audience growth' },
  { id: 'qualified-traffic', label: 'Qualified traffic' },
  { id: 'conversion', label: 'Conversion' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'cost', label: 'Cost' },
  { id: 'latency', label: 'Latency' },
  { id: 'human-acquisition-cost', label: 'Human acquisition cost' },
  { id: 'engine-acquisition-cost', label: 'Engine acquisition cost' },
  { id: 'rights-risk', label: 'Rights risk' },
  { id: 'policy-risk', label: 'Policy risk' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'quality', label: 'Quality' },
  { id: 'operational-risk', label: 'Operational risk' },
];

/** One capability verdict cell (the frozen provider profiles' own support values). */
export interface MosCapabilityVerdict {
  readonly operation: string;
  readonly support: 'supported' | 'unsupported' | 'unknown';
  readonly note: string;
}

/**
 * The five-platform capability matrix — the support values verbatim from
 * the frozen provider profiles (mos-distribution providers). `unknown`
 * renders as "unknown — observation pending", never as supported.
 */
export const MOS_SOCIAL_CAPABILITY_MATRIX: readonly {
  readonly platform: MosSocialPlatformId;
  readonly verdicts: readonly MosCapabilityVerdict[];
}[] = [
  {
    platform: 'youtube',
    verdicts: [
      { operation: 'publish', support: 'supported', note: 'publicly-documented video upload API surface (video uploads)' },
      { operation: 'schedule', support: 'supported', note: 'publicly-documented scheduled-publish parameter on video uploads' },
      { operation: 'read-observations', support: 'supported', note: 'publicly-documented analytics/reporting API surface (video metrics)' },
      { operation: 'delete', support: 'supported', note: 'publicly-documented video deletion API surface' },
      { operation: 'list-restrictions', support: 'unknown', note: 'no publicly-known per-channel restriction-listing surface — observation-pending' },
    ],
  },
  {
    platform: 'instagram',
    verdicts: [
      { operation: 'publish', support: 'supported', note: 'publicly-documented media publish surface' },
      { operation: 'schedule', support: 'supported', note: 'platform scheduling through the documented surface' },
      { operation: 'read-observations', support: 'supported', note: 'publicly-documented insights surface' },
      { operation: 'delete', support: 'unknown', note: 'no committed delete surface — observation-pending' },
      { operation: 'list-restrictions', support: 'unknown', note: 'no publicly-known restriction-listing surface — observation-pending' },
    ],
  },
  {
    platform: 'facebook-pages',
    verdicts: [
      { operation: 'publish', support: 'supported', note: 'publicly-documented page post surface' },
      { operation: 'schedule', support: 'supported', note: 'publicly-documented page post scheduling' },
      { operation: 'read-observations', support: 'supported', note: 'publicly-documented page insights surface' },
      { operation: 'delete', support: 'supported', note: 'publicly-documented page post deletion' },
      { operation: 'list-restrictions', support: 'unknown', note: 'no publicly-known restriction-listing surface — observation-pending' },
    ],
  },
  {
    platform: 'tiktok',
    verdicts: [
      { operation: 'publish', support: 'supported', note: 'publicly-documented content post surface' },
      { operation: 'schedule', support: 'unknown', note: 'no committed scheduling surface — observation-pending' },
      { operation: 'read-observations', support: 'supported', note: 'publicly-documented analytics surface' },
      { operation: 'delete', support: 'unknown', note: 'no committed delete surface — observation-pending' },
      { operation: 'list-restrictions', support: 'unknown', note: 'no publicly-known restriction-listing surface — observation-pending' },
    ],
  },
  {
    platform: 'x',
    verdicts: [
      { operation: 'publish', support: 'supported', note: 'publicly-documented post surface' },
      { operation: 'schedule', support: 'unknown', note: 'no committed scheduling surface — observation-pending' },
      { operation: 'read-observations', support: 'supported', note: 'publicly-documented metrics surface' },
      { operation: 'delete', support: 'supported', note: 'publicly-documented post deletion' },
      { operation: 'list-restrictions', support: 'unknown', note: 'no publicly-known restriction-listing surface — observation-pending' },
    ],
  },
];

/** One provider-catalogue entry (the Connections page's four-across cards). */
export interface MosProviderCatalogueEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: 'social' | 'ads';
  readonly line: string;
  /** The secure-setup lane's expected-domain pill (the credentials law). */
  readonly expectedDomain: string;
}

/**
 * The provider catalogue — 8 entries (5 social + 3 ads). YouTube is the
 * PRIMARY card (the default connect entry); every entry carries its
 * expected-domain pill for the secure setup lane.
 */
export const MOS_PROVIDER_CATALOGUE: readonly MosProviderCatalogueEntry[] = [
  { id: 'youtube', name: 'YouTube', kind: 'social', line: 'Video, Shorts, and the channel observation surface.', expectedDomain: 'accounts.google.com' },
  { id: 'instagram', name: 'Instagram', kind: 'social', line: 'Photo and reel publishing with the insights surface.', expectedDomain: 'www.instagram.com' },
  { id: 'facebook-pages', name: 'Facebook Pages', kind: 'social', line: 'Page posts, scheduling, and page insights.', expectedDomain: 'www.facebook.com' },
  { id: 'tiktok', name: 'TikTok', kind: 'social', line: 'Short-video publishing and the analytics surface.', expectedDomain: 'www.tiktok.com' },
  { id: 'x', name: 'X', kind: 'social', line: 'Posts and metrics on the X surface.', expectedDomain: 'x.com' },
  { id: 'google-ads', name: 'Google Ads', kind: 'ads', line: 'Search, YouTube pre-roll, and display promotion.', expectedDomain: 'ads.google.com' },
  { id: 'meta-ads', name: 'Meta Ads', kind: 'ads', line: 'Instagram and Facebook promotion through the Meta surface.', expectedDomain: 'adsmanager.facebook.com' },
  { id: 'tiktok-ads', name: 'TikTok Ads', kind: 'ads', line: 'Short-video paid promotion.', expectedDomain: 'ads.tiktok.com' },
];

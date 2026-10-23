import type {
  SocialCapabilityVerdictView,
  SocialConnectVerdictView,
  SocialPlatformView,
  SocialWorkspacePort,
  SocialWorkspaceView,
} from '../dist/src/ports/social-workspace.js';

/**
 * DISCLOSED in-memory double for the {@link SocialWorkspacePort} (the UXR
 * social wave) — the composition seam OUTSIDE `src/`.
 *
 * REAL-SHAPED DATA, copied VERBATIM from the frozen provider profiles
 * (`@mos/distribution` SOCIAL-002..006, packages at
 * `src/adapters/providers/<provider>/<provider>-profile.ts`): every
 * capability verdict, claim-basis note and auth-model KIND below is the
 * profile's own declaration, character for character — this double renders
 * the same matrix the PRODUCTION binding imports at runtime, so the
 * render-level tests pin the exact vocabulary (supported / unsupported /
 * unknown, with unknown PRESERVED first-class). The guided-setup states
 * are the honest fresh states (every step `not-started`, no mission
 * context, sandbox values declared-by-user / compared-to-baseline /
 * source-linked) — the same honesty the production binding derives.
 *
 * NOT a production binding: the production root
 * (packages/mos-desktop/composition/production-social.ts) imports the REAL
 * frozen profile DATA from the built provider subpaths instead of copying.
 */

/** The honest connect verdict for THIS release (no credentials exist anywhere). */
const CONNECT_UNAVAILABLE: SocialConnectVerdictView = {
  kind: 'unavailable',
  reason:
    'no credentials exist anywhere in this composition — the shipped provider transports are self-labelling in-memory doubles and the real account connection awaits the production service transport; this matrix renders no live connect action, only the verdict',
};

/** The guided-setup steps the target design declares (labels + hints verbatim). */
const GUIDED_STEP_SIGNALS: readonly string[] = [
  'the setup-details form declares a create-mission intent and the receipt renders on the Missions surface — that receipt is the completion signal (the form renders below)',
  'optional — a real account connection needs the production service transport, unavailable in this release; the guided browser pane beside this checklist covers PUBLIC source access only',
  'a declared simulation setup (audience, content formats, resource bounds, time horizon) with its assumptions stated — carried by the declared mission objective',
  'the Research Lab corpus/evidence section opens with source-linked records (/lab?section=corpus)',
  'the Research Lab strategy comparison opens with the no-op baseline and uncertainty intervals (/lab?section=strategy)',
];

const GUIDED_STEP_LABELS: readonly { readonly label: string; readonly hint: string }[] = [
  { label: '1. Choose goal', hint: 'Research and strategy' },
  { label: '2. Source access', hint: 'Optional; secure auth only' },
  { label: '3. Define simulation', hint: 'Audience, content, horizon' },
  { label: '4. Inspect evidence', hint: 'Sources and assumptions' },
  { label: '5. Compare strategies', hint: 'Baseline, uncertainty' },
];

function guidedSetupOf(providerId: string): SocialPlatformView['guidedSetup'] {
  return {
    providerId,
    guidedSteps: GUIDED_STEP_LABELS.map((step, index) => ({
      position: index + 1,
      label: step.label,
      hint: step.hint,
      state: 'not-started',
      completionSignal: GUIDED_STEP_SIGNALS[index] ?? '',
    })),
    missionContext: null,
    simulationSandbox: {
      title: 'Simulation workspace — SANDBOX',
      boundary: 'No live publish • no invented analytics • no account changes',
      statusRows: [
        { label: 'Audience / market', value: 'Declared by user', sourceRoute: null },
        {
          label: 'Candidate strategies',
          value: 'Compared to baseline',
          sourceRoute: '/lab?section=strategy',
        },
        {
          label: 'Evidence / uncertainty',
          value: 'Source-linked records',
          sourceRoute: '/lab?section=corpus',
        },
      ],
    },
  };
}

/** The profiles' shared evidence-basis statement (identical in all five). */
const EVIDENCE_BASIS =
  "declared from public platform developer-documentation knowledge at this codebase's authoring horizon; the sandbox performs NO live-platform verification; no endpoint URLs, rate-limit numbers or error taxonomies are invented — see README.md for each claim's basis and the UNKNOWN disclaimers";

/** One matrix row, tersely (verbatim verdict + note). */
function verdict(
  operation: string,
  support: SocialCapabilityVerdictView['support'],
  note: string,
): SocialCapabilityVerdictView {
  return { operation, support, note };
}

/**
 * The five frozen provider profiles as the workspace read model — VERBATIM
 * capability matrices (SOCIAL-002 YouTube, SOCIAL-003 Instagram,
 * SOCIAL-004 Facebook Pages, SOCIAL-005 TikTok, SOCIAL-006 X). Public
 * home-page URLs are PRESENTATION copy for the guided browser pane (the
 * well-known public sites, not API-endpoint claims — the profiles
 * deliberately declare no endpoint URLs).
 */
const PLATFORMS: readonly SocialPlatformView[] = [
  {
    providerId: 'provider:youtube',
    slug: 'youtube',
    displayName: 'YouTube',
    selected: true,
    capabilityVerdicts: [
      verdict('publish', 'supported', 'publicly-documented video upload API surface (video uploads)'),
      verdict('schedule', 'supported', 'publicly-documented scheduled-publish parameter on video uploads'),
      verdict('read-observations', 'supported', 'publicly-documented analytics/reporting API surface (video metrics)'),
      verdict('delete', 'supported', 'publicly-documented video deletion API surface'),
      verdict('list-restrictions', 'unknown', 'no publicly-known per-channel restriction-listing surface — observation-pending'),
    ],
    authModelKind: 'oauth2',
    authFlows: ['authorization-code', 'device'],
    evidenceBasis: EVIDENCE_BASIS,
    operationShapes: ['video-upload (publish, schedule — video artifacts)'],
    publicSiteUrl: 'https://www.youtube.com/',
    connectVerdict: CONNECT_UNAVAILABLE,
    guidedSetup: guidedSetupOf('provider:youtube'),
  },
  {
    providerId: 'provider:instagram',
    slug: 'instagram',
    displayName: 'Instagram',
    selected: false,
    capabilityVerdicts: [
      verdict('publish', 'supported', 'publicly-documented container-based content publishing surface (photo, video and carousel media)'),
      verdict('schedule', 'supported', 'publicly-documented scheduled publication of IMAGE posts; video/carousel scheduling is outside the declared shapes (observation-pending)'),
      verdict('read-observations', 'supported', 'publicly-documented insights/metrics surface for business accounts (media metrics)'),
      verdict('delete', 'unknown', 'no confidently-known public deletion surface for published media — observation-pending'),
      verdict('list-restrictions', 'unknown', 'no publicly-known per-account restriction-listing surface — observation-pending'),
    ],
    authModelKind: 'oauth2',
    authFlows: ['authorization-code'],
    evidenceBasis: EVIDENCE_BASIS,
    operationShapes: [
      'image-post (publish, schedule)',
      'image-carousel (publish)',
      'video-upload (publish)',
    ],
    publicSiteUrl: 'https://www.instagram.com/',
    connectVerdict: CONNECT_UNAVAILABLE,
    guidedSetup: guidedSetupOf('provider:instagram'),
  },
  {
    providerId: 'provider:facebook-pages',
    slug: 'facebook-pages',
    displayName: 'Facebook Pages',
    selected: false,
    capabilityVerdicts: [
      verdict('publish', 'supported', 'publicly-documented page feed publishing surface (text, link, photo and video posts)'),
      verdict('schedule', 'supported', 'publicly-documented scheduled publication of page feed posts (text/link/photo shapes; video scheduling is outside the declared shapes — observation-pending)'),
      verdict('read-observations', 'supported', 'publicly-documented page insights/metrics surface (post and page metrics)'),
      verdict('delete', 'supported', 'publicly-documented page post deletion surface'),
      verdict('list-restrictions', 'unknown', 'no publicly-known per-page restriction-listing surface — observation-pending'),
    ],
    authModelKind: 'oauth2',
    authFlows: ['authorization-code'],
    evidenceBasis: EVIDENCE_BASIS,
    operationShapes: [
      'text-post (publish, schedule)',
      'link-preview-post (publish, schedule)',
      'image-post (publish, schedule)',
      'video-upload (publish)',
    ],
    publicSiteUrl: 'https://www.facebook.com/',
    connectVerdict: CONNECT_UNAVAILABLE,
    guidedSetup: guidedSetupOf('provider:facebook-pages'),
  },
  {
    providerId: 'provider:tiktok',
    slug: 'tiktok',
    displayName: 'TikTok',
    selected: false,
    capabilityVerdicts: [
      verdict('publish', 'supported', 'publicly-documented content posting surface (video posts and photo posts)'),
      verdict('schedule', 'unknown', 'no confidently-known first-party scheduling surface in the public posting API at the authoring horizon — observation-pending'),
      verdict('read-observations', 'supported', 'publicly-documented display surface reporting video-level metrics (view/like/comment/share counts)'),
      verdict('delete', 'unknown', 'no confidently-known public deletion surface at the authoring horizon — observation-pending'),
      verdict('list-restrictions', 'unknown', 'no publicly-known per-account restriction-listing surface — observation-pending'),
    ],
    authModelKind: 'oauth2',
    authFlows: ['authorization-code'],
    evidenceBasis: EVIDENCE_BASIS,
    operationShapes: ['video-upload (publish)', 'image-post (publish)'],
    publicSiteUrl: 'https://www.tiktok.com/',
    connectVerdict: CONNECT_UNAVAILABLE,
    guidedSetup: guidedSetupOf('provider:tiktok'),
  },
  {
    providerId: 'provider:x',
    slug: 'x',
    displayName: 'X',
    selected: false,
    capabilityVerdicts: [
      verdict('publish', 'supported', 'publicly-documented posting surface (text posts and posts with image or video media)'),
      verdict('schedule', 'unknown', 'no confidently-known first-party public scheduling surface at the authoring horizon — observation-pending (third-party schedulers and ads surfaces are not this surface)'),
      verdict('read-observations', 'supported', 'publicly-documented public post metrics (impressions, likes, reposts and related reported metrics)'),
      verdict('delete', 'supported', 'publicly-documented post deletion surface'),
      verdict('list-restrictions', 'unknown', 'no publicly-known per-account restriction-listing surface — observation-pending'),
    ],
    authModelKind: 'oauth2',
    authFlows: ['authorization-code-with-pkce'],
    evidenceBasis: EVIDENCE_BASIS,
    operationShapes: ['text-post (publish)', 'image-post (publish)', 'video-upload (publish)'],
    publicSiteUrl: 'https://x.com/',
    connectVerdict: CONNECT_UNAVAILABLE,
    guidedSetup: guidedSetupOf('provider:x'),
  },
];

/** The frozen view the double serves (deep-frozen like the profiles). */
const WORKSPACE_VIEW: SocialWorkspaceView = Object.freeze({
  platforms: PLATFORMS.map((platform) => Object.freeze(platform)),
});

/** Build the disclosed in-memory Social workspace port (read-only). */
export function createInMemorySocialWorkspacePort(): SocialWorkspacePort {
  return {
    async loadSocialWorkspace(): Promise<SocialWorkspaceView | { error: 'social-workspace-unavailable'; message: string }> {
      return WORKSPACE_VIEW;
    },
  };
}

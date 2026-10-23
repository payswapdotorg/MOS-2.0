import type { MissionRepository } from '@mos/missions';
import type { TenantScope } from '@mos/contracts';
import type {
  LabOverviewPort,
  SocialCapabilityVerdictView,
  SocialConnectVerdictView,
  SocialGuidedSetupView,
  SocialPlatformView,
  SocialWorkspacePort,
  SocialWorkspaceView,
} from '@mos/web';
import {
  YOUTUBE_PROVIDER_ID,
  YOUTUBE_PROVIDER_PROFILE,
} from '../../mos-distribution/dist/adapters/providers/youtube/index.js';
import {
  INSTAGRAM_PROVIDER_ID,
  INSTAGRAM_PROVIDER_PROFILE,
} from '../../mos-distribution/dist/adapters/providers/instagram/index.js';
import {
  FACEBOOK_PAGES_PROVIDER_ID,
  FACEBOOK_PAGES_PROVIDER_PROFILE,
} from '../../mos-distribution/dist/adapters/providers/facebook-pages/index.js';
import {
  TIKTOK_PROVIDER_ID,
  TIKTOK_PROVIDER_PROFILE,
} from '../../mos-distribution/dist/adapters/providers/tiktok/index.js';
import {
  X_PROVIDER_ID,
  X_PROVIDER_PROFILE,
} from '../../mos-distribution/dist/adapters/providers/x/index.js';

/**
 * PRODUCTION Social workspace binding over the REAL frozen provider
 * profile DATA (the UXR social wave — @mos/distribution SOCIAL-002..006).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline): this is the
 * PRODUCTION binding, not a double — the five provider profiles are
 * imported at runtime from the built provider subpaths (the package's own
 * exports map declares those dist entries; the provider-neutral root index
 * deliberately carries no provider specifics), and every capability
 * verdict is rendered VERBATIM from the frozen DATA. Nothing here invents
 * a provider state, upgrades an `unknown` into a claim, or adds an
 * operation the profiles do not declare.
 *
 * The guided-setup read model derives its states from REAL bound state
 * only: the mission repository (a mission existing in the tenant scope is
 * step 1's completion signal — the setup form's declaration, executed and
 * versioned by the Missions authority) and the Lab workspace's overview
 * read (corpus evidence / simulation runs honestly advancing the inspect
 * and compare steps). A FRESH composition therefore reports every step
 * `not-started` — never a guessed `in-progress`.
 *
 * The connect verdict is HONEST for this release: no OAuth transport is
 * bound and no credentials exist anywhere in this composition, so every
 * platform's connect verdict is `unavailable` naming what it waits on —
 * the production MOS service transport. The public home-page URLs are
 * PRESENTATION copy for the guided browser pane (the well-known public
 * sites, never API-endpoint claims — the frozen profiles deliberately
 * declare no endpoint URLs).
 */

/** Options for {@link createProductionSocialWorkspacePort}. */
export interface ProductionSocialWorkspacePortOptions {
  /** The REAL missions repository the guided-setup step state derives from. */
  readonly missionRepository: MissionRepository;
  /** The tenant scope the derivations are scoped to (spec §31). */
  readonly scope: TenantScope;
  /** The REAL bound Lab workspace overview read (optional — honest without it). */
  readonly labOverview?: LabOverviewPort;
}

/** The honest connect verdict for THIS release (no credentials exist anywhere). */
const CONNECT_UNAVAILABLE: SocialConnectVerdictView = {
  kind: 'unavailable',
  reason:
    'no credentials exist anywhere in this composition — the shipped provider transports are self-labelling in-memory doubles and the real account connection awaits the production MOS service transport; this matrix renders the verdict, never a live connect action',
};

/** The guided-setup steps the target design declares (labels + hints verbatim). */
const GUIDED_STEP_SIGNALS: readonly string[] = [
  'the setup-details form declares a create-mission intent and the receipt renders on the Missions surface — a mission existing in this tenant scope is the completion signal this read model derives',
  'optional — a real account connection needs the production service transport, unavailable in this release; the guided browser pane beside this checklist covers PUBLIC source access only',
  'a declared simulation setup (audience, content formats, resource bounds, time horizon) with its assumptions stated — carried by the declared mission objective',
  'the Research Lab corpus/evidence section opens with source-linked records (/lab?section=corpus) — corpus evidence existing in this tenant scope advances this step',
  'the Research Lab strategy comparison opens with the no-op baseline and uncertainty intervals (/lab?section=strategy) — simulation runs existing in this tenant scope advance this step',
];

const GUIDED_STEP_LABELS: readonly { readonly label: string; readonly hint: string }[] = [
  { label: '1. Choose goal', hint: 'Research and strategy' },
  { label: '2. Source access', hint: 'Optional; secure auth only' },
  { label: '3. Define simulation', hint: 'Audience, content, horizon' },
  { label: '4. Inspect evidence', hint: 'Sources and assumptions' },
  { label: '5. Compare strategies', hint: 'Baseline, uncertainty' },
];

/** The honest static sandbox rows (the workspace's discipline, not live counts). */
const SANDBOX_STATUS_ROWS: SocialGuidedSetupView['simulationSandbox']['statusRows'] = [
  { label: 'Audience / market', value: 'Declared by user', sourceRoute: null },
  { label: 'Candidate strategies', value: 'Compared to baseline', sourceRoute: '/lab?section=strategy' },
  { label: 'Evidence / uncertainty', value: 'Source-linked records', sourceRoute: '/lab?section=corpus' },
];

interface ProfileShape {
  readonly providerId: { toString(): string };
  readonly displayName: string;
  readonly capabilityMatrix: readonly {
    readonly operation: string;
    readonly support: 'supported' | 'unsupported' | 'unknown';
    readonly note?: string;
  }[];
  readonly auth: { readonly model: { readonly kind: string }; readonly flows: readonly string[] };
  readonly operationShapes: readonly {
    readonly operation: string;
    readonly shapes: readonly string[];
  }[];
  readonly evidenceBasis: string;
}

function capabilityVerdictsOf(profile: ProfileShape): readonly SocialCapabilityVerdictView[] {
  return profile.capabilityMatrix.map((entry) => ({
    operation: entry.operation,
    support: entry.support,
    note: entry.note ?? null,
  }));
}

function operationShapesOf(profile: ProfileShape): readonly string[] {
  return profile.operationShapes.map((entry) => `${entry.shapes.join(', ')} (${entry.operation})`);
}

function platformViewOf(
  profile: ProfileShape,
  slug: string,
  publicSiteUrl: string,
  selected: boolean,
  guidedSetup: SocialGuidedSetupView,
): SocialPlatformView {
  return {
    providerId: String(profile.providerId),
    slug,
    displayName: profile.displayName,
    selected,
    capabilityVerdicts: capabilityVerdictsOf(profile),
    authModelKind: profile.auth.model.kind,
    authFlows: [...profile.auth.flows],
    evidenceBasis: profile.evidenceBasis,
    operationShapes: operationShapesOf(profile),
    publicSiteUrl,
    connectVerdict: CONNECT_UNAVAILABLE,
    guidedSetup,
  };
}

function guidedSetupOf(
  providerId: string,
  state: {
    missionExists: boolean;
    evidenceExists: boolean;
    runsExist: boolean;
    missionContext: SocialGuidedSetupView['missionContext'];
  },
): SocialGuidedSetupView {
  const stepState = (position: number): 'not-started' | 'in-progress' | 'complete' => {
    switch (position) {
      case 1:
        return state.missionExists ? 'complete' : 'not-started';
      case 2:
        // Source access is structurally unavailable in this release — the
        // step never claims progress it cannot have.
        return 'not-started';
      case 3:
        return state.missionExists ? 'in-progress' : 'not-started';
      case 4:
        return state.evidenceExists ? 'in-progress' : 'not-started';
      case 5:
        return state.runsExist ? 'in-progress' : 'not-started';
      default:
        return 'not-started';
    }
  };
  return {
    providerId,
    guidedSteps: GUIDED_STEP_LABELS.map((step, index) => ({
      position: index + 1,
      label: step.label,
      hint: step.hint,
      state: stepState(index + 1),
      completionSignal: GUIDED_STEP_SIGNALS[index] ?? '',
    })),
    missionContext: state.missionContext,
    simulationSandbox: {
      title: 'Simulation workspace — SANDBOX',
      boundary: 'No live publish • no invented analytics • no account changes',
      statusRows: SANDBOX_STATUS_ROWS,
    },
  };
}

/**
 * Build the production Social workspace port: the five REAL frozen
 * provider profiles behind the workspace read model, guided-setup states
 * derived from the REAL mission repository and the bound Lab overview
 * read (degrading honestly to `not-started` when the overview read fails).
 */
export function createProductionSocialWorkspacePort(
  options: ProductionSocialWorkspacePortOptions,
): SocialWorkspacePort {
  const deriveState = async (): Promise<{
    missionExists: boolean;
    evidenceExists: boolean;
    runsExist: boolean;
    missionContext: SocialGuidedSetupView['missionContext'];
  }> => {
    let missions: readonly { id: unknown; updatedAt: string; objective: { statement: string } }[] = [];
    try {
      missions = [...options.missionRepository.listMissions(options.scope)] as never;
    } catch {
      missions = [];
    }
    // (UXR-WC recovery note: this line did not compile under the composition
    // project's strict tsconfig — `readonly` arrays carry no in-place sort.
    // Copied to a mutable array, the identical most-recent-first derivation.)
    const sorted = [...missions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const recent = sorted[0];
    const missionContext =
      recent === undefined
        ? null
        : {
            route: `/console?mission=${encodeURIComponent(String(recent.id))}`,
            note: `Mission ${String(recent.id)} — ${recent.objective.statement}`,
          };
    let evidenceExists = false;
    let runsExist = false;
    if (options.labOverview !== undefined) {
      try {
        const overview = await options.labOverview.loadLabOverview(options.scope);
        if (!('error' in overview)) {
          evidenceExists =
            overview.evidence.historicalObservationCount > 0 ||
            overview.corpusTimeBoundaries.earliestAcquiredAt !== null;
          runsExist = overview.recentRuns.length > 0;
        }
      } catch {
        // The overview read failed: the steps stay `not-started` — an
        // honest absence, never a guessed advance.
      }
    }
    return {
      missionExists: missions.length > 0,
      evidenceExists,
      runsExist,
      missionContext,
    };
  };

  return {
    async loadSocialWorkspace(): Promise<SocialWorkspaceView | { error: 'social-workspace-unavailable'; message: string }> {
      const state = await deriveState();
      const platforms: readonly SocialPlatformView[] = [
        platformViewOf(
          YOUTUBE_PROVIDER_PROFILE as ProfileShape,
          'youtube',
          'https://www.youtube.com/',
          true,
          guidedSetupOf(String(YOUTUBE_PROVIDER_ID), state),
        ),
        platformViewOf(
          INSTAGRAM_PROVIDER_PROFILE as ProfileShape,
          'instagram',
          'https://www.instagram.com/',
          false,
          guidedSetupOf(String(INSTAGRAM_PROVIDER_ID), state),
        ),
        platformViewOf(
          FACEBOOK_PAGES_PROVIDER_PROFILE as ProfileShape,
          'facebook-pages',
          'https://www.facebook.com/',
          false,
          guidedSetupOf(String(FACEBOOK_PAGES_PROVIDER_ID), state),
        ),
        platformViewOf(
          TIKTOK_PROVIDER_PROFILE as ProfileShape,
          'tiktok',
          'https://www.tiktok.com/',
          false,
          guidedSetupOf(String(TIKTOK_PROVIDER_ID), state),
        ),
        platformViewOf(
          X_PROVIDER_PROFILE as ProfileShape,
          'x',
          'https://x.com/',
          false,
          guidedSetupOf(String(X_PROVIDER_ID), state),
        ),
      ];
      return { platforms };
    },
  };
}

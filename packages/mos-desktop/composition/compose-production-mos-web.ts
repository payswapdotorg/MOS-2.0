import type { IdentityRepository } from '@mos/identity';
import type { MissionRepository } from '@mos/missions';
import type { TenantScope } from '@mos/contracts';
import type { MosWebComposition } from '@mos/web';
import { createInMemoryIdentityRepository } from '../../mos-identity/dist/index.js';
import { createInMemoryMissionRepository } from '../../mos-missions/dist/index.js';
import { createProductionAppShellPort } from './production-app-shell.js';
import {
  createProductionMissionCatalogPort,
  type ProductionMissionCatalog,
} from './production-mission-catalog.js';
import {
  createProductionLabSurface,
  type ProductionLabRuntime,
} from './production-lab-surface.js';
import { createProductionLabIntents } from './production-lab-intents.js';
import {
  createProductionAgentConsole,
  type ProductionAgentConsole,
} from './production-agent-console.js';
import {
  createProductionLabWorkspace,
  type ProductionLabWorkspaceRuntime,
} from './production-lab-workspace.js';
import {
  createUnavailableConnections,
  createUnavailableNotifications,
  createUnavailableStudioDirectory,
  createUnavailableStudioPackages,
} from './unavailable-surfaces.js';
import { createProductionSocialWorkspacePort } from './production-social.js';

/**
 * PRODUCTION composition root for the MOS desktop shell (MOS v2.0, registry
 * module `desktop`).
 *
 * Composition seam (OUTSIDE `src/`, mirroring @mos/web's testing-seam
 * position): the only place allowed to import the domain runtimes. This is
 * the PRODUCTION binding — REAL domain runtimes, no fixture imports, no
 * demo seeds, honest availability verdicts everywhere:
 *
 *  - `appShell` — over the REAL `@mos/identity` repository. The composition
 *    (not the shell — spec §31) resolves the DEVICE-LOCAL tenant context:
 *    it registers the local tenant in the real repository at creation,
 *    because the identity service transport (sign-in, workspace selection)
 *    arrives with the P2 service-transport wave. Until then the desktop
 *    presents exactly this one real tenant and NO workspace.
 *  - `missionCatalog` — over the REAL `@mos/missions` repository: derived
 *    read models (the append-only record-version walk), the create-mission
 *    intent declaration recorded in the composition's ledger with receipts
 *    (executing intents is the Missions authority's job; the authority
 *    transport is P2 — see production-mission-catalog.ts), and the
 *    reward-metric vocabulary pinned to the real `RewardMetricId` union.
 *    A fresh composition starts with ZERO missions.
 *  - `labBenchmark` / `labCalibration` — over the REAL `@mos/lab` runtime
 *    stack (LAB-007 ensemble → LAB-017 robust benchmark + LAB-018 online
 *    calibration over the disclosed in-memory reality reader): fresh
 *    state, empty tenant-scoped listings, fail-closed record projection
 *    (production-lab-surface.ts + lab-runtime-projection.ts).
 *  - `labIntents` — the Lab WRITE-INTENT transport (UX-003 wave 3) over
 *    the REAL lab runtimes: the shell declares, this composition routes
 *    each declaration to the lab authority (corpus rights gate, world
 *    models + simulator, organization search, strategy learning, robust
 *    benchmark, online calibration), the ledger carries every verdict
 *    verbatim, and executed records surface in the section read models
 *    (production-lab-intents.ts + its parse/core/workspace/runs split).
 *  - `studioDirectory` / `studioPackages` / `connections` / `notifications`
 *    — explicit honest-unavailable bindings (unavailable-surfaces.ts): P2
 *    DISCLOSURE — these surfaces await the production MOS service
 *    transport; this composition binds read models ONLY for identity,
 *    missions and lab. Every one of them answers through its own typed
 *    failure/empty vocabulary — never fabricated data.
 *
 * Runtime imports use the RELATIVE BUILT-DIST paths (the siblings' exports
 * maps point their runtime condition at untranspiled src, which node cannot
 * execute — the same disclosed pattern @mos/web's testing seam uses);
 * type imports stay on the package names (erased at compile time). Vite
 * consumes this file from SOURCE for the desktop renderer bundle.
 */

/** Options for {@link createProductionMosWebComposition}. */
export interface ProductionMosWebCompositionOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /**
   * The tenant id the composition resolves (the device-local tenant).
   * Default `tenant-local`.
   */
  readonly tenantId?: string;
  /** Display name of the resolved tenant. */
  readonly tenantDisplayName?: string;
  /**
   * The workspace within the tenant, or `null` (a MEANINGFUL state — the
   * tenant scope without a workspace). Default `null`.
   */
  readonly workspaceId?: string | null;
}

/** The composed shell plus the seams tests and hosts need to inspect. */
export interface ProductionMosWebComposition extends MosWebComposition {
  /** The REAL identity repository the app-shell views are derived from. */
  readonly identityRepository: IdentityRepository;
  /** The REAL missions repository the catalog views are derived from. */
  readonly missionRepository: MissionRepository;
  /** The recorded create-mission intent ledger (disclosed observability). */
  readonly recordedIntents: ProductionMissionCatalog['recordedIntents'];
  /** The REAL lab runtimes the Lab surface reads (disclosed observability). */
  readonly labRuntime: ProductionLabRuntime;
  /** The REAL lab WORKSPACE runtimes (LAB-001..016 — disclosed observability). */
  readonly labWorkspaceRuntime: ProductionLabWorkspaceRuntime;
  /** The REAL console authority chain (the CONSOLE wave — disclosed observability). */
  readonly consoleBinding: ProductionAgentConsole;
  /** The tenant scope the composition presents. */
  readonly scope: { readonly tenantId: string; readonly workspaceId: string | null };
}

const DEFAULT_TENANT_ID = 'tenant-local';
const DEFAULT_TENANT_DISPLAY_NAME = 'MOS Desktop (local context)';

/**
 * Compose the PRODUCTION MOS desktop shell: REAL identity + missions + lab
 * runtimes behind the shell's view ports, honest-unavailable bindings for
 * the surfaces awaiting the service transport, and the device-local tenant
 * context resolved by this composition root.
 */
export function createProductionMosWebComposition(
  options: ProductionMosWebCompositionOptions = {},
): ProductionMosWebComposition {
  const now = options.now ?? (() => new Date().toISOString());
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const tenantDisplayName = options.tenantDisplayName ?? DEFAULT_TENANT_DISPLAY_NAME;
  // `null` is a MEANINGFUL configuration (tenant scope without a workspace);
  // only an absent option falls back — to `null` (no workspace), honestly.
  const workspaceId = options.workspaceId === undefined ? null : options.workspaceId;

  const identityRepository = createInMemoryIdentityRepository({ now });
  const missionRepository = createInMemoryMissionRepository({ now });

  // Resolve the device-local tenant context in the REAL repository (the
  // composition decides what is resolved — spec §31). The repository starts
  // fresh, so the registration always succeeds; a failure is loud, never
  // swallowed into a half-resolved context.
  const tenantResult = identityRepository.createTenant({
    id: tenantId as never,
    name: tenantDisplayName,
  });
  if ('error' in tenantResult) {
    throw new Error(
      `production composition could not register the device-local tenant: ${tenantResult.message}`,
    );
  }
  if (workspaceId !== null) {
    const workspaceResult = identityRepository.createWorkspace({
      scope: { tenantId: tenantId as never },
      id: workspaceId as never,
      name: 'MOS Desktop workspace',
    });
    if ('error' in workspaceResult) {
      throw new Error(
        `production composition could not register the local workspace: ${workspaceResult.message}`,
      );
    }
  }

  const scope: TenantScope =
    workspaceId === null
      ? { tenantId: tenantId as never }
      : { tenantId: tenantId as never, workspaceId: workspaceId as never };

  const appShell = createProductionAppShellPort({
    identityRepository,
    missionRepository,
    scope,
    tenantId,
    workspaceId,
  });
  const catalog = createProductionMissionCatalogPort({ missionRepository, now });
  const labSurface = createProductionLabSurface({ now });
  const labWorkspace = createProductionLabWorkspace();

  // The Lab write-intent transport over the REAL runtimes (UX-003 wave 3):
  // the workspace runtimes carry the corpus/simulator/search/learning
  // authorities, the lab surface's runtime stack carries the benchmark and
  // calibration authorities, and the composition's tenant scope scopes
  // every declaration + ledger read.
  const labIntents = createProductionLabIntents({
    scope,
    labWorkspaceRuntime: labWorkspace.labWorkspaceRuntime,
    benchmark: labSurface.labRuntime.benchmark,
    calibration: labSurface.labRuntime.calibration,
    now,
  });

  // The PRODUCTION Agent Console binding (the CONSOLE wave): the REAL
  // planner/compiler/engine + rights/intelligence/experiments/agents
  // authorities behind the console view ports — every declared intent
  // executes against the REAL runtimes and every verdict is relayed
  // VERBATIM (production-agent-console.ts + its split modules).
  const consoleBinding = createProductionAgentConsole({
    scope,
    now,
    missionRepository,
    labBenchmark: labSurface.labRuntime.benchmark,
  });

  // The Social Media workspace (the UXR social wave): the REAL frozen
  // provider profile DATA (SOCIAL-002..006) behind the workspace read
  // model, guided-setup states derived from the REAL mission repository
  // and the bound Lab overview read — verdicts verbatim, unknowns kept.
  const socialWorkspace = createProductionSocialWorkspacePort({
    missionRepository,
    scope,
    labOverview: labWorkspace.labOverview,
  });

  // The notifications binding presents the REAL tenant context (§31).
  const tenant = identityRepository.getTenant(tenantId as never);
  const notifications = createUnavailableNotifications({
    tenant: {
      tenantId: tenant?.id ?? (tenantId as never),
      tenantDisplayName: tenant?.name ?? tenantDisplayName,
      workspaceId: null,
      workspaceDisplayName: null,
    },
    now,
  });

  return {
    appShell,
    missionCatalog: catalog.port,
    studioDirectory: createUnavailableStudioDirectory(),
    studioPackages: createUnavailableStudioPackages(),
    labBenchmark: labSurface.labBenchmark,
    labCalibration: labSurface.labCalibration,
    labOverview: labWorkspace.labOverview,
    labCorpus: labWorkspace.labCorpus,
    labIdeaGraph: labWorkspace.labIdeaGraph,
    labSimulator: labWorkspace.labSimulator,
    labStrategy: labWorkspace.labStrategy,
    labTransforms: labWorkspace.labTransforms,
    labBridge: labWorkspace.labBridge,
    labIntents,
    agentConsole: consoleBinding.agentConsole,
    consoleIntents: consoleBinding.consoleIntents,
    connections: createUnavailableConnections(),
    social: socialWorkspace,
    notifications,
    identityRepository,
    missionRepository,
    recordedIntents: catalog.recordedIntents,
    labRuntime: labSurface.labRuntime,
    labWorkspaceRuntime: labWorkspace.labWorkspaceRuntime,
    consoleBinding,
    scope: { tenantId, workspaceId },
  };
}

import type { IdentityRepository } from '@mos/identity';
import type { MissionRepository } from '@mos/missions';
import type { TenantScope } from '@mos/contracts';
import type { MosWebComposition } from '../dist/src/ports/composition.js';
import { createInMemoryIdentityRepository } from '../../mos-identity/dist/index.js';
import { createInMemoryMissionRepository } from '../../mos-missions/dist/index.js';
import { createInMemoryAppShellPort } from './in-memory-app-shell.js';
import { createInMemoryMissionCatalogPort } from './in-memory-mission-catalog.js';
import { createInMemoryStudioSurface } from './in-memory-studio-surface.js';
import { createInMemoryLabSurface } from './in-memory-lab-surface.js';
import { createInMemoryLabWorkspace } from './in-memory-lab-workspace.js';
import { createInMemoryLabIntents } from './in-memory-lab-intents.js';
import {
  createConsoleDoubleState,
  createInMemoryAgentConsolePort,
  createInMemoryConsoleIntents,
} from './in-memory-console-double.js';
import { connectionsCompositionDouble } from './connections-composition-double.js';
import { createInMemoryNotificationsViewPort } from './notifications-composition-double.js';
import { createInMemorySocialWorkspacePort } from './social-composition-double.js';

/**
 * DISCLOSED in-memory composition for the MOS browser shell (WEB-001 /
 * UX-001 + UX-002 build).
 *
 * This is the composition seam OUTSIDE `src/` — the only place allowed to
 * import domain packages (`@mos/identity`, `@mos/missions` at runtime; and,
 * for UX-002, `@mos/studio` TYPE-ONLY — the studio runtime is node-side
 * (`node:crypto`) so the Studio surface runs on REAL-shape fixtures pinned
 * to the studio port types and adapted through the shared shape adapter;
 * the node-only compat battery proves that adapter zero-drift over the REAL
 * exported runtime). Runtime imports use the RELATIVE BUILT-DIST paths
 * (`../../mos-identity/dist/index.js`) — the siblings' exports maps point
 * their runtime condition at untranspiled `src/index.ts`, which node cannot
 * execute — the same disclosed pattern `@mos/studio`'s testing seam uses;
 * type imports stay on the package names (erased at compile time).
 *
 * RESOLUTION INVARIANT (see tsconfig.testing.json): the seam is emitted to
 * `out/` — a SIBLING of `testing/` at package depth — so the relative
 * sibling paths above resolve IDENTICALLY from the source (vite bundles
 * this file directly from `testing/`) and from the emitted output (node
 * loads `out/compose-in-memory-mos-web.js` for the tests). The package's
 * own surface is consumed type-only (erased) — the seam has NO runtime
 * dependency on `src/`, which is what lets the same file serve both.
 *
 * The shell this composes is the UX-001/UX-002 presentation: the REAL
 * identity and missions repositories (their in-memory adapters are the
 * siblings' own disclosed ephemeral scaffolds) behind the shell's view
 * ports, plus the disclosed Studio surface double, with a seeded demo
 * tenant/workspace. It is NOT the production composition root: the TL-owned
 * root binds the same ports over the MOS service transport
 * (`MosServiceTransport`) without touching the shell's `src/` tree.
 */

/** Options for {@link createInMemoryMosWebComposition}. */
export interface InMemoryMosWebCompositionOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Tenant/workspace the shell presents. */
  readonly tenantId?: string;
  readonly workspaceId?: string | null;
  /**
   * Seed the demo missions (UX-006): three lifecycle-varied REAL records
   * through the REAL repository, so the browser shell's front door is
   * demonstrable end-to-end (the Studio/Lab seams already self-seed their
   * fixture records). Default OFF: the node-side tests seed their own
   * mission records and assert exact counts from a fresh repository.
   */
  readonly seedDemoMissions?: boolean;
}

/** The composed shell plus the seams tests need to seed and inspect. */
export interface InMemoryMosWebComposition extends MosWebComposition {
  /** The REAL identity repository the app-shell views are derived from. */
  readonly identityRepository: IdentityRepository;
  /** The REAL missions repository the catalog views are derived from. */
  readonly missionRepository: MissionRepository;
  /** The recorded create-mission intent ledger (disclosed observability). */
  readonly recordedIntents: () => readonly unknown[];
  /** The tenant scope the composition presents. */
  readonly scope: { readonly tenantId: string; readonly workspaceId: string | null };
  /** The disclosed Studio surface double (UX-002 observability). */
  readonly studioSurface: ReturnType<typeof createInMemoryStudioSurface>;
  /** The disclosed Lab surface double (UX-003 observability). */
  readonly labSurface: ReturnType<typeof createInMemoryLabSurface>;
  /** The disclosed Lab WORKSPACE double (UX-003 wave 2 observability). */
  readonly labWorkspace: ReturnType<typeof createInMemoryLabWorkspace>;
  /** The disclosed Lab write-intents double (UX-003 wave 3 observability). */
  readonly labIntents: ReturnType<typeof createInMemoryLabIntents>;
  /** The disclosed Connections surface double (UX-004 observability). */
  readonly connectionsSurface: typeof connectionsCompositionDouble;
  /** The disclosed Notifications surface double (NOTIFY-CS observability). */
  readonly notificationsSurface: ReturnType<typeof createInMemoryNotificationsViewPort>;
  /** The disclosed Social workspace double (the UXR social wave observability). */
  readonly socialSurface: ReturnType<typeof createInMemorySocialWorkspacePort>;
  /** The disclosed Console double state (the CONSOLE wave observability). */
  readonly consoleDoubleState: ReturnType<typeof createConsoleDoubleState>;
}

const DEMO_TENANT_ID = 'tenant-demo';
const DEMO_WORKSPACE_ID = 'ws_demo';

/** Demo missions (UX-006): REAL records seeded through the REAL repository. */
const DEMO_MISSIONS: readonly {
  readonly id: string;
  readonly objective: {
    readonly statement: string;
    readonly targetMetrics: readonly {
      readonly metric: string;
      readonly target: string;
      readonly unit: string;
      readonly horizon: null;
    }[];
    readonly constraints: readonly never[];
  };
  readonly rewardSpec: {
    readonly version: number;
    readonly terms: readonly {
      readonly metric: string;
      readonly weight: number;
      readonly direction: 'maximize';
      readonly definition: string;
    }[];
  };
  readonly lifecycle: 'draft' | 'active' | 'completed';
}[] = [
  {
    id: 'mission_demo_1',
    objective: {
      statement: 'Run the MOS demo mission end to end.',
      targetMetrics: [
        { metric: 'qualified-reach', target: '10000', unit: 'count', horizon: null },
      ],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        { metric: 'qualified-reach', weight: 1, direction: 'maximize', definition: 'Reach among demo accounts.' },
      ],
    },
    lifecycle: 'active',
  },
  {
    id: 'mission_demo_2',
    objective: {
      statement: 'Measure the closed-loop improvement on the demo program.',
      targetMetrics: [
        { metric: 'attributed-revenue', target: '2500', unit: 'count', horizon: null },
      ],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        { metric: 'attributed-revenue', weight: 1, direction: 'maximize', definition: 'Attributed revenue among demo accounts.' },
      ],
    },
    lifecycle: 'completed',
  },
  {
    id: 'mission_demo_3',
    objective: {
      statement: 'Declare the next demo mission for the acceptance pass.',
      targetMetrics: [
        { metric: 'qualified-reach', target: '15000', unit: 'count', horizon: null },
      ],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        { metric: 'qualified-reach', weight: 1, direction: 'maximize', definition: 'Reach among the next demo cohort.' },
      ],
    },
    lifecycle: 'draft',
  },
];

/**
 * Compose the in-memory MOS web shell: REAL identity + missions
 * repositories behind the declared view ports, seeded with the demo tenant
 * and workspace.
 */
export function createInMemoryMosWebComposition(
  options: InMemoryMosWebCompositionOptions = {},
): InMemoryMosWebComposition {
  const now = options.now ?? (() => new Date().toISOString());
  const tenantId = options.tenantId ?? DEMO_TENANT_ID;
  // `null` is a MEANINGFUL configuration (tenant scope without a workspace);
  // only an absent option falls back to the demo workspace.
  const workspaceId =
    options.workspaceId === undefined ? DEMO_WORKSPACE_ID : options.workspaceId;

  const identityRepository = createInMemoryIdentityRepository({ now });
  const missionRepository = createInMemoryMissionRepository({ now });

  // Seed the demo tenant + workspace (idempotent: the demo ids are fixed).
  const tenantResult = identityRepository.createTenant({
    id: tenantId as never,
    name: 'Demo Tenant',
  });
  if ('error' in tenantResult) {
    throw new Error(`in-memory composition could not seed the demo tenant: ${tenantResult.message}`);
  }
  if (workspaceId !== null) {
    const workspaceResult = identityRepository.createWorkspace({
      scope: { tenantId: tenantId as never },
      id: workspaceId as never,
      name: 'Demo Workspace',
    });
    if ('error' in workspaceResult) {
      throw new Error(
        `in-memory composition could not seed the demo workspace: ${workspaceResult.message}`,
      );
    }
  }

  const appShell = createInMemoryAppShellPort({
    identityRepository,
    missionRepository,
    scope:
      workspaceId === null
        ? { tenantId: tenantId as never }
        : { tenantId: tenantId as never, workspaceId: workspaceId as never },
    tenantId,
    workspaceId,
  });
  const catalogDouble = createInMemoryMissionCatalogPort({
    missionRepository,
    now,
  });
  const labIntents = createInMemoryLabIntents({
    now,
    scope: { tenantId: tenantId as never, workspaceId: workspaceId as never },
  });

  // Seed the demo missions through the REAL repository when asked (the
  // disclosed-double pattern the Studio/Lab seams already follow — their
  // surfaces self-seed fixture records; the Missions surface seeded only the
  // tenant before UX-006, leaving the browser shell's front door
  // honestly-but-unhelpfully empty. Three lifecycle-varied missions make the
  // whole-shell acceptance pass demonstrable: REAL records, REAL §13 badges,
  // REAL selection flow — while the node-side tests keep their fresh-start
  // default).
  if (options.seedDemoMissions === true) for (const demo of DEMO_MISSIONS) {
    const seeded = missionRepository.createMission({
      scope: { tenantId: tenantId as never },
      id: demo.id as never,
      objective: demo.objective as never,
      rewardSpec: demo.rewardSpec as never,
    });
    if ('error' in seeded) {
      throw new Error(
        `in-memory composition could not seed the demo mission ${demo.id}: ${seeded.message}`,
      );
    }
    const scope = { tenantId: tenantId as never };
    if (demo.lifecycle === 'active' || demo.lifecycle === 'completed') {
      const activated = missionRepository.activateMission(scope, demo.id as never);
      if ('error' in activated) {
        throw new Error(
          `in-memory composition could not activate the demo mission ${demo.id}: ${activated.message}`,
        );
      }
    }
    if (demo.lifecycle === 'completed') {
      const completed = missionRepository.completeMission(scope, demo.id as never);
      if ('error' in completed) {
        throw new Error(
          `in-memory composition could not complete the demo mission ${demo.id}: ${completed.message}`,
        );
      }
    }
  }
  const studioSurface = createInMemoryStudioSurface();
  const labSurface = createInMemoryLabSurface();
  const labWorkspace = createInMemoryLabWorkspace();

  const notificationsPort = createInMemoryNotificationsViewPort();
  const socialWorkspace = createInMemorySocialWorkspacePort();

  // The Agent Console double (the CONSOLE wave): the shared state the read
  // projections and the intent executions ride, over the REAL mission
  // repository this composition already holds.
  const consoleDoubleState = createConsoleDoubleState();
  const consoleScope: TenantScope =
    workspaceId === null
      ? { tenantId: tenantId as never }
      : { tenantId: tenantId as never, workspaceId: workspaceId as never };
  const agentConsole = createInMemoryAgentConsolePort({
    state: consoleDoubleState,
    missionRepository,
    scope: consoleScope,
    now,
  });
  const consoleIntents = createInMemoryConsoleIntents({
    state: consoleDoubleState,
    missionRepository,
    scope: consoleScope,
    now,
  });

  return {
    appShell,
    missionCatalog: catalogDouble.port,
    studioDirectory: studioSurface.studioDirectory,
    studioPackages: studioSurface.studioPackages,
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
    agentConsole,
    consoleIntents,
    connections: connectionsCompositionDouble,
    social: socialWorkspace,
    notifications: notificationsPort,
    identityRepository,
    missionRepository,
    recordedIntents: catalogDouble.recordedIntents,
    scope: { tenantId, workspaceId },
    studioSurface,
    labSurface,
    labWorkspace,
    connectionsSurface: connectionsCompositionDouble,
    notificationsSurface: notificationsPort,
    socialSurface: socialWorkspace,
    consoleDoubleState,
  };
}

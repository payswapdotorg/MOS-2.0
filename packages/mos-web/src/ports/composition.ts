import type { AppShellPort } from './app-shell.js';
import type { MissionCatalogPort } from './mission-catalog.js';
import type { StudioDirectoryPort } from './studio-directory.js';
import type { StudioPackageLibraryPort } from './studio-packages.js';
import type { LabBenchmarkDigestPort } from './lab-benchmark.js';
import type { LabCalibrationStatusPort } from './lab-calibration.js';
import type { LabOverviewPort } from './lab-overview.js';
import type { LabCorpusViewPort } from './lab-corpus.js';
import type { LabIdeaGraphViewPort } from './lab-idea-graph.js';
import type { LabSimulatorViewPort } from './lab-simulator.js';
import type { LabStrategyViewPort } from './lab-strategy.js';
import type { LabTransformsViewPort } from './lab-transforms.js';
import type { LabBridgeViewPort } from './lab-bridge.js';
import type { LabIntentsPort } from './lab-intents.js';
import type { AgentConsolePort } from './agent-console.js';
import type { ConsoleIntentsPort } from './console-intents.js';
import type { ConnectionsViewPort } from './connections-views.js';
import type { NotificationsViewPort } from './notifications-views.js';
import type { SocialWorkspacePort } from './social-workspace.js';

/**
 * The composition the browser shell runs on (WEB-001).
 *
 * Everything the shell can do flows through these view ports. The package
 * `src/` tree never imports a domain package: per the frozen module registry
 * the web module depends on `[contracts]` only, and per the dependency matrix
 * `UI → contracts` projections are the allowed direction. Domain types are
 * adapted into the view models above at the composition seam OUTSIDE `src/`
 * (`testing/`), which is the only place allowed to import
 * `@mos/missions` / `@mos/identity` (runtime) and `@mos/studio`
 * (type-only, REAL-shape pins — the studio runtime itself is node-side; see
 * the seam's disclosure). The Lab surface (UX-003) follows the same
 * discipline over REAL-shaped LAB-017/LAB-018 records, the full Lab
 * WORKSPACE (UX-003 wave 2) over the REAL-shaped LAB-001..016 + §24 bridge
 * record mirrors, and the Connections surface (UX-004) over the PROD-001
 * distribution/integrations shapes.
 */
export interface MosWebComposition {
  /** Shell chrome: sections, availability verdicts, tenant context. */
  readonly appShell: AppShellPort;
  /** The Missions surface (UX-001): read models + intent declaration. */
  readonly missionCatalog: MissionCatalogPort;
  /** The Studio session directory (UX-002, over STUDIO-014): read-only. */
  readonly studioDirectory: StudioDirectoryPort;
  /** The Studio package library (UX-002, over STUDIO-014): read-only browsing. */
  readonly studioPackages: StudioPackageLibraryPort;
  /** The Lab benchmark digest (UX-003, over LAB-017): read-only. */
  readonly labBenchmark: LabBenchmarkDigestPort;
  /** The Lab online-calibration status (UX-003, over LAB-018): read-only. */
  readonly labCalibration: LabCalibrationStatusPort;
  /** The Lab research overview (UX-003, over the LAB-001..018 aggregate): read-only. */
  readonly labOverview: LabOverviewPort;
  /** The Lab corpus & evidence surface (UX-003, over LAB-001/002): read-only. */
  readonly labCorpus: LabCorpusViewPort;
  /** The Lab Idea Graph surface (UX-003, over LAB-003): read-only. */
  readonly labIdeaGraph: LabIdeaGraphViewPort;
  /** The Lab simulator & Time Machine surface (UX-003, over LAB-004/005/006): read-only. */
  readonly labSimulator: LabSimulatorViewPort;
  /** The Lab strategy & organizations surface (UX-003, over LAB-007..010 + LAB-016 seam): read-only. */
  readonly labStrategy: LabStrategyViewPort;
  /** The Lab transforms surface (UX-003, over LAB-011/012): read-only. */
  readonly labTransforms: LabTransformsViewPort;
  /** The Lab next-steps bridge (UX-003, over the §24 authorized path): read-only declarations. */
  readonly labBridge: LabBridgeViewPort;
  /**
   * The Lab write-intent transport (UX-003 wave 3): declarations in,
   * authority-verdict receipts out. The shell never writes — this port
   * routes declared intents to the lab authority runtimes at the seam
   * (additive: read models stay on the section ports above).
   */
  readonly labIntents: LabIntentsPort;
  /**
   * The Agent Console read models (the CONSOLE wave): the mission-first
   * workspace's per-mode views over the REAL mission/agent/rights/
   * intelligence/experiment authorities at the seam.
   */
  readonly agentConsole: AgentConsolePort;
  /**
   * The Console write-intent transport: declarations in, authority-verdict
   * receipts out (the wave-21 lab-intents pattern applied to the
   * mission→evidence→plan→strategy→run→approval chain). The shell never
   * writes — this port routes declared intents to the owning authority
   * runtimes at the seam.
   */
  readonly consoleIntents: ConsoleIntentsPort;
  /** The Connections surface (UX-004, over PROD-001): read-only. */
  readonly connections: ConnectionsViewPort;
  /**
   * The Social Media workspace (the UXR social wave, over the frozen
   * SOCIAL-002..006 provider profiles): read-only — the workspace's only
   * write-shaped action declares a create-mission INTENT through the
   * existing `missionCatalog` transport.
   */
  readonly social: SocialWorkspacePort;
  /** The Notifications consumer surface (NOTIFY-CS, over NOTIFY-001): read-only. */
  readonly notifications: NotificationsViewPort;
}

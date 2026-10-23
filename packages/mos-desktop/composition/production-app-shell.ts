import type { TenantId, TenantScope, WorkspaceId } from '@mos/contracts';
import type { IdentityRepository } from '@mos/identity';
import type { MissionRepository } from '@mos/missions';
import type {
  AppShellLoadFailure,
  AppShellPort,
  AppShellView,
  ShellRecentMissionView,
  ShellSectionId,
  ShellSectionView,
  SurfaceAvailabilityView,
  TenantContextView,
} from '@mos/web';

/**
 * PRODUCTION app-shell adapter over the REAL `@mos/identity` and
 * `@mos/missions` repositories (MOS v2.0 desktop shell; wave-24
 * target-design conversion).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline): adapts the
 * real identity + missions read models into the shell's presentation-shaped
 * view models. This is the production binding — NOT a double: the
 * repositories are the REAL domain runtimes, and the section table's
 * availability verdicts are HONEST for this release:
 *
 *  - `home`, `missions`, `lab` (presented as "Research Lab", the target
 *    design's label), `console` and `social` (the UXR social wave — the
 *    frozen provider profiles behind the Social Media workspace's read
 *    model) are AVAILABLE (real read models bound: identity tenant
 *    context, the REAL mission repository, the REAL LAB-017/LAB-018
 *    runtimes, the REAL console authority chain, the REAL SOCIAL-002..006
 *    provider profile DATA);
 *  - `studio` and `measurement` are NOT-YET-AVAILABLE: this composition
 *    binds NO read models for them — the verdict names the production MOS
 *    service transport they wait on, per the first-class
 *    `not-yet-available` vocabulary. The shell never renders placeholder
 *    content for a surface it cannot honestly show.
 *
 * The wave-24 target-design conversion also moved the shell chrome to the
 * supplied MOS Agent Console mockups' information architecture: the primary
 * navigation rail carries the mockup's six sections. The `connections` and
 * `notifications` ROUTES remain in the route model (deep-linkable, with
 * their own honest unavailable verdicts through their ports) but are no
 * longer primary navigation in the shipped desktop rail.
 *
 * The composition — not the shell — decides what tenant context is
 * resolved (spec §31). The desktop composition resolves the device-local
 * tenant the composition root itself registers in the REAL repository
 * (see compose-production-mos-web.ts for the disclosure: the identity
 * service transport with sign-in arrives with P2).
 */

/** Options for {@link createProductionAppShellPort}. */
export interface ProductionAppShellPortOptions {
  /** The REAL identity repository the view models are derived from. */
  readonly identityRepository: IdentityRepository;
  /**
   * The REAL missions repository the rail's recent-missions list and the
   * header's mission-activity status are derived from (wave-24).
   */
  readonly missionRepository: MissionRepository;
  /**
   * The tenant scope the mission reads are scoped to (spec §31 — the
   * composition decides; the desktop root resolves the device-local tenant).
   */
  readonly scope: TenantScope;
  /**
   * The tenant this composition resolves (spec §31 — the composition
   * decides; the desktop root registers the device-local tenant).
   */
  readonly tenantId: string;
  /** The workspace within the tenant, or `null` (a meaningful state). */
  readonly workspaceId: string | null;
}

/**
 * The availability verdict table for this release (the target design's six
 * primary sections). Home, Missions, Research Lab and Agent Console are
 * available; the surfaces whose read models this composition does not bind
 * carry the honest `not-yet-available` verdict naming what they wait on
 * (the port vocabulary's `dependsOn`).
 */
const SECTION_TABLE: readonly {
  readonly id: ShellSectionId;
  readonly label: string;
  readonly route: string;
  readonly availability: SurfaceAvailabilityView;
}[] = [
  { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
  { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  {
    id: 'lab',
    label: 'Research Lab',
    route: '/lab',
    availability: { kind: 'available' },
  },
  { id: 'console', label: 'Agent Console', route: '/console', availability: { kind: 'available' } },
  {
    id: 'social',
    label: 'Social Media',
    route: '/social',
    availability: { kind: 'available' },
  },
  {
    id: 'studio',
    label: 'Studio',
    route: '/studio',
    availability: {
      kind: 'not-yet-available',
      dependsOn: 'the production MOS service transport — this release binds no studio read models',
    },
  },
  {
    id: 'measurement',
    label: 'Measurement',
    route: '/measurement',
    availability: {
      kind: 'not-yet-available',
      dependsOn: 'the production MOS service transport — this release binds no measurement read models',
    },
  },
];

/** How many recent missions the shell rail presents. */
const RECENT_MISSIONS_LIMIT = 5;

/**
 * Derive the rail's recent-missions list from the REAL repository: most
 * recently mutated first (the repository's `updatedAt`), view-shaped. A
 * read failure returns an empty list — the rail then honestly shows "No
 * recent missions" instead of guessing.
 */
function recentMissionsOf(
  missionRepository: MissionRepository,
  scope: TenantScope,
): readonly ShellRecentMissionView[] {
  try {
    const missions = [...missionRepository.listMissions(scope)];
    missions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return missions.slice(0, RECENT_MISSIONS_LIMIT).map((mission) => ({
      missionId: String(mission.id),
      title: mission.objective.statement,
      route: `/console?mission=${encodeURIComponent(String(mission.id))}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Build the production app-shell port over REAL `IdentityRepository` and
 * `MissionRepository` runtimes. Home and Missions come first in the section
 * order.
 */
export function createProductionAppShellPort(
  options: ProductionAppShellPortOptions,
): AppShellPort {
  const sections: readonly ShellSectionView[] = SECTION_TABLE.map((section) => ({ ...section }));

  const tenantContext = (): TenantContextView | null => {
    const tenant = options.identityRepository.getTenant(options.tenantId as TenantId);
    if (tenant === null) {
      // Unknown tenant: NO tenant context — the Missions surface renders
      // its explicit no-tenant state; existence is never leaked.
      return null;
    }
    let workspaceName: string | null = null;
    if (options.workspaceId !== null) {
      for (const workspace of options.identityRepository.listWorkspaces({
        tenantId: options.tenantId as TenantId,
      })) {
        if (workspace.id === options.workspaceId) {
          workspaceName = workspace.name;
          break;
        }
      }
    }
    return {
      tenantId: tenant.id,
      tenantDisplayName: tenant.name,
      workspaceId: options.workspaceId as WorkspaceId,
      workspaceDisplayName: workspaceName,
    };
  };

  const missionStatus = (): { readonly active: boolean } | null => {
    try {
      const active = options.missionRepository
        .listMissions(options.scope)
        .some((mission) => mission.status === 'active');
      return { active };
    } catch {
      return null;
    }
  };

  return {
    async loadAppShell(): Promise<AppShellView | AppShellLoadFailure> {
      return {
        sections,
        tenant: tenantContext(),
        missionStatus: missionStatus(),
        recentMissions: recentMissionsOf(options.missionRepository, options.scope),
      };
    },
  };
}

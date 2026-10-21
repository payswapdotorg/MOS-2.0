import type { TenantId, WorkspaceId } from '@mos/contracts';
import type { IdentityRepository } from '@mos/identity';
import type {
  AppShellLoadFailure,
  AppShellPort,
  AppShellView,
  ShellSectionId,
  ShellSectionView,
  SurfaceAvailabilityView,
  TenantContextView,
} from '@mos/web';

/**
 * PRODUCTION app-shell adapter over the REAL `@mos/identity` repository
 * (MOS v2.0 desktop shell).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline): adapts the
 * real identity read models into the shell's presentation-shaped view
 * models. This is the production binding — NOT a double: the repository is
 * the REAL domain runtime, and the section table's availability verdicts
 * are HONEST for this release:
 *
 *  - `home`, `missions` and `lab` are AVAILABLE (real read models bound:
 *    identity tenant context, the REAL mission repository, the REAL
 *    LAB-017/LAB-018 runtimes);
 *  - `studio`, `connections` and `notifications` are NOT-YET-AVAILABLE:
 *    this composition binds NO read models for them (their ports return
 *    the surfaces' own typed unavailable failures) — the verdict names the
 *    production MOS service transport they wait on, per the first-class
 *  `not-yet-available` vocabulary. The shell never renders placeholder
 *  content for a surface it cannot honestly show.
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
   * The tenant this composition resolves (spec §31 — the composition
   * decides; the desktop root registers the device-local tenant).
   */
  readonly tenantId: string;
  /** The workspace within the tenant, or `null` (a meaningful state). */
  readonly workspaceId: string | null;
}

/**
 * The availability verdict table for this release. Home, Missions and Lab
 * are available; the surfaces whose read models this composition does not
 * bind carry the honest `not-yet-available` verdict naming what they wait
 * on (the port vocabulary's `dependsOn`).
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
    id: 'studio',
    label: 'Studio',
    route: '/studio',
    availability: {
      kind: 'not-yet-available',
      dependsOn: 'the production MOS service transport — this release binds no studio read models',
    },
  },
  { id: 'lab', label: 'Lab', route: '/lab', availability: { kind: 'available' } },
  {
    id: 'connections',
    label: 'Connections',
    route: '/connections',
    availability: {
      kind: 'not-yet-available',
      dependsOn:
        'the production MOS service transport — this release binds no provider-integrations or social-distribution read models',
    },
  },
  {
    id: 'notifications',
    label: 'Notifications',
    route: '/notifications',
    availability: {
      kind: 'not-yet-available',
      dependsOn: 'the production MOS service transport — this release binds no notification-plane read models',
    },
  },
];

/**
 * Build the production app-shell port over a REAL `IdentityRepository`.
 * Home and Missions come first in the section order.
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

  return {
    async loadAppShell(): Promise<AppShellView | AppShellLoadFailure> {
      return {
        sections,
        tenant: tenantContext(),
      };
    },
  };
}

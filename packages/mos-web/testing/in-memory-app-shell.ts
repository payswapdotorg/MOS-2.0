import type { IdentityRepository, TenantId, WorkspaceId } from '@mos/identity';
import type {
  AppShellLoadFailure,
  AppShellPort,
  AppShellView,
  ShellSectionId,
  ShellSectionView,
  SurfaceAvailabilityView,
  TenantContextView,
} from '../dist/src/ports/app-shell.js';

/**
 * DISCLOSED in-memory double for the {@link AppShellPort} (WEB-001 / UX-001
 * / UX-002).
 *
 * Composition seam (OUTSIDE `src/`): this is the only kind of file allowed
 * to import a domain package, because it ADAPTS the real `@mos/identity`
 * read models into the shell's presentation-shaped view models. It is an
 * ephemeral, process-local scaffold — NOT a production binding: the
 * production composition root (TL-owned) binds the same port over the MOS
 * service transport (`MosServiceTransport` seam in `src/services/`) without
 * touching the port or any view component.
 *
 * The section table mirrors the shell-replacement plan's route readiness
 * (BROWSER-SHELL-REPLACEMENT-PLAN §2.2): Home, Missions (UX-001) and Studio
 * (UX-002, over the delivered STUDIO-014 standalone studio product) are
 * available in this build; Lab and Connections wait on UX-003/UX-004 and are
 * presented as explicit `not-yet-available` verdicts — the shell never
 * renders placeholder surfaces.
 */

/** Options for {@link createInMemoryAppShellPort}. */
export interface InMemoryAppShellPortOptions {
  /** The REAL identity repository the view models are derived from. */
  readonly identityRepository: IdentityRepository;
  /**
   * The tenant/workspace the shell presents (spec §31 — the shell itself
   * never picks a default tenant; the composition decides what is resolved).
   */
  readonly tenantId: string;
  readonly workspaceId: string | null;
}

const SECTION_TABLE: readonly {
  readonly id: ShellSectionId;
  readonly label: string;
  readonly route: string;
  readonly availability: SurfaceAvailabilityView;
}[] = [
  { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
  { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  { id: 'studio', label: 'Studio', route: '/studio', availability: { kind: 'available' } },
  {
    id: 'lab',
    label: 'Lab',
    route: '/lab',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-003 (LAB-017 robust benchmark)' },
  },
  {
    id: 'connections',
    label: 'Connections',
    route: '/connections',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-004 (PROD-001 distribution/integrations)' },
  },
];

/**
 * Build the in-memory app-shell port over a REAL `IdentityRepository`.
 * Home and Missions come first in the section order.
 */
export function createInMemoryAppShellPort(
  options: InMemoryAppShellPortOptions,
): AppShellPort {
  const sections: readonly ShellSectionView[] = SECTION_TABLE.map((section) => ({ ...section }));

  const tenantContext = (): TenantContextView | null => {
    const tenant = options.identityRepository.getTenant(options.tenantId as TenantId);
    if (tenant === null) {
      // Unknown tenant: NO tenant context — the Missions surface renders its
      // explicit no-tenant state; existence is never leaked.
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

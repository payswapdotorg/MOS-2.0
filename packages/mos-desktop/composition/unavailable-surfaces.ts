import type { TenantScope } from '@mos/contracts';
import type {
  ConnectionsViewData,
  ConnectionsViewPort,
  NotificationsPageData,
  NotificationsViewPort,
  StudioDirectoryPort,
  StudioPackageLibraryPort,
  TenantContextView,
} from '@mos/web';

/**
 * PRODUCTION honest-unavailable bindings for the surfaces this release
 * does NOT bind read models for (MOS v2.0 desktop shell).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline). P2
 * DISCLOSURE — these surfaces await the production MOS service transport:
 * the Studio session directory + package library (UX-002 over STUDIO-014),
 * the Connections directory + distribution bindings (UX-004 over
 * INTEG-001/PROD-001) and the Notifications consumer surface (NOTIFY-CS
 * over NOTIFY-001). This composition binds NO data for them — each port
 * answers through its OWN typed failure/empty vocabulary, never fabricated
 * records and never placeholder content:
 *
 *  - the Studio ports return their typed `*-unavailable` failures;
 *  - the Connections port returns the two DISTINCT authorities' read
 *    models with honest `unavailable` availability verdicts and EMPTY
 *    provider/binding listings (the verdict, not the emptiness, carries
 *    the meaning — an empty-but-available listing would claim a working
 *    authority);
 *  - the Notifications port returns the page model with an honest
 *    `unavailable` verdict, EMPTY inbox/suppressions, no selected record —
 *    and the REAL tenant context from the identity repository (§31: the
 *    context is real even where the plane is not bound yet).
 */

/**
 * Build the honest-unavailable Studio session-directory binding (read-only
 * port; both methods return the typed unavailable failure).
 */
export function createUnavailableStudioDirectory(): StudioDirectoryPort {
  return {
    async listStudioSessions(_scope: TenantScope) {
      return {
        error: 'studio-directory-unavailable',
        message:
          'the studio session directory is not bound in this release — this composition binds no STUDIO-014 read models; the production MOS service transport arrives with P2',
      };
    },
    async loadStudioSessionDetail(_sessionId, _scope) {
      return {
        error: 'studio-directory-unavailable',
        message:
          'the studio session directory is not bound in this release — this composition binds no STUDIO-014 read models; the production MOS service transport arrives with P2',
      };
    },
  };
}

/**
 * Build the honest-unavailable Studio package-library binding (read-only
 * browsing port; both methods return the typed unavailable failure).
 */
export function createUnavailableStudioPackages(): StudioPackageLibraryPort {
  const message =
    'the studio package library is not bound in this release — this composition binds no STUDIO-014 read models; the production MOS service transport arrives with P2';
  return {
    async listStudioPackages(_scope: TenantScope) {
      return { error: 'studio-package-library-unavailable', message };
    },
    async loadStudioPackageChain(_packageId, _scope) {
      return { error: 'studio-package-library-unavailable', message };
    },
  };
}

/**
 * Build the honest-unavailable Connections binding: the two DISTINCT
 * authorities (§3 — never fused) each report an explicit `unavailable`
 * verdict with EMPTY listings.
 */
export function createUnavailableConnections(): ConnectionsViewPort {
  const directory = {
    authority: 'provider-integrations' as const,
    providers: [],
    availability: {
      kind: 'unavailable' as const,
      reason:
        'the provider-integrations authority is not bound in this release — this composition binds no provider directory read models; the production MOS service transport arrives with P2',
    },
  };
  const bindings = {
    authority: 'social-distribution' as const,
    bindings: [],
    availability: {
      kind: 'unavailable' as const,
      reason:
        'the social-distribution authority is not bound in this release — this composition binds no distribution-binding read models; the production MOS service transport arrives with P2',
    },
  };
  return {
    async getConnectionsViewData(): Promise<ConnectionsViewData> {
      return { directory, bindings };
    },
  };
}

/** Options for {@link createUnavailableNotifications}. */
export interface UnavailableNotificationsOptions {
  /** The REAL tenant context (from the identity repository — §31). */
  readonly tenant: TenantContextView;
  /** Injectable clock for the page model's `generatedAtMs`. */
  readonly now?: () => string;
}

/**
 * Build the honest-unavailable Notifications binding: real tenant context,
 * explicit `unavailable` verdict, empty inbox and suppression registry, no
 * selected record.
 */
export function createUnavailableNotifications(
  options: UnavailableNotificationsOptions,
): NotificationsViewPort {
  return {
    async getNotificationsViewData(): Promise<NotificationsPageData> {
      return {
        tenant: {
          tenantId: options.tenant.tenantId,
          tenantDisplayName: options.tenant.tenantDisplayName,
        },
        availability: {
          kind: 'unavailable',
          reason:
            'the notification plane is not bound in this release — this composition binds no NOTIFY-001 read models; the production MOS service transport arrives with P2',
        },
        inbox: [],
        selected: null,
        recipientSuppressions: [],
        generatedAtMs: options.now ? Date.parse(options.now()) : Date.now(),
      };
    },
  };
}

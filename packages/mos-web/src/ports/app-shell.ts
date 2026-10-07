import type { TenantId, WorkspaceId } from '@mos/contracts';

/**
 * App-shell view port (WEB-001).
 *
 * The one port the browser shell asks for its own chrome: which product
 * sections exist, which of them this build may actually show, and which
 * tenant context (spec §31) the shell is presenting. The web package is
 * presentation-only (module registry: `web` → authority `presentation-only`,
 * dependencies `[contracts]`): this port returns view models, never domain
 * records, and the shell renders exactly what it is given — including the
 * explicit "not yet available" verdicts for sections whose product surfaces
 * land in later waves (UX-002 Studio, UX-003 Lab, UX-004 Connections).
 *
 * Implemented at the composition seam OUTSIDE `src/`
 * (`testing/in-memory-app-shell.ts` — disclosed in-memory double over
 * `@mos/identity`); a server-side composition binds the same port over the
 * MOS service transport later without touching this file.
 */

/** Product sections of the MOS browser shell. Home and Missions are UX-001. */
export type ShellSectionId = 'home' | 'missions' | 'studio' | 'lab' | 'connections';

/**
 * Availability of a product surface in this shell build. Unavailable is a
 * FIRST-CLASS state naming what it waits for — the shell never renders
 * placeholder content for a surface it cannot honestly show
 * (BROWSER-SHELL-REPLACEMENT-PLAN §4 risk 5).
 */
export type SurfaceAvailabilityView =
  | { readonly kind: 'available' }
  | { readonly kind: 'not-yet-available'; readonly dependsOn: string };

/** One navigation section as presented by the shell. */
export interface ShellSectionView {
  readonly id: ShellSectionId;
  /** Presentation label shown in the navigation. */
  readonly label: string;
  /** App-internal route path (`/`, `/missions`, …). */
  readonly route: string;
  readonly availability: SurfaceAvailabilityView;
}

/** The tenant/workspace context the shell is presenting (spec §31). */
export interface TenantContextView {
  readonly tenantId: TenantId;
  readonly tenantDisplayName: string;
  readonly workspaceId: WorkspaceId | null;
  readonly workspaceDisplayName: string | null;
}

/** Everything the app shell chrome needs. */
export interface AppShellView {
  /** Navigation sections in display order; Home and Missions come first. */
  readonly sections: readonly ShellSectionView[];
  /** Tenant context, or `null` when no tenant context is resolved. */
  readonly tenant: TenantContextView | null;
}

/** Typed failure shape for {@link AppShellPort.loadAppShell}. */
export interface AppShellLoadFailure {
  readonly error: 'app-shell-unavailable';
  readonly message: string;
}

/**
 * The declared app-shell surface. Async by design: the production binding is
 * a server round-trip, so loading and failure states are part of the contract.
 */
export interface AppShellPort {
  loadAppShell(): Promise<AppShellView | AppShellLoadFailure>;
}

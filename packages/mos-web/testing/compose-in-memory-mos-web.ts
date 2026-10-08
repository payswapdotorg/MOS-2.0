import type { IdentityRepository } from '@mos/identity';
import type { MissionRepository } from '@mos/missions';
import type { MosWebComposition } from '../dist/src/ports/composition.js';
import { createInMemoryIdentityRepository } from '../../mos-identity/dist/index.js';
import { createInMemoryMissionRepository } from '../../mos-missions/dist/index.js';
import { createInMemoryAppShellPort } from './in-memory-app-shell.js';
import { createInMemoryMissionCatalogPort } from './in-memory-mission-catalog.js';

/**
 * DISCLOSED in-memory composition for the MOS browser shell (WEB-001 /
 * UX-001 build).
 *
 * This is the composition seam OUTSIDE `src/` — the only place allowed to
 * import domain packages (`@mos/identity`, `@mos/missions`), because it is
 * exactly here that domain read models are adapted into the shell's
 * declared view ports. Runtime imports use the RELATIVE BUILT-DIST paths
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
 * The shell this composes is the UX-001 presentation: the REAL identity and
 * missions repositories (their in-memory adapters are the siblings' own
 * disclosed ephemeral scaffolds) behind the shell's view ports, with a
 * seeded demo tenant/workspace. It is NOT the production composition root:
 * the TL-owned root binds the same ports over the MOS service transport
 * (`MosServiceTransport`) without touching the shell's `src/` tree.
 */

/** Options for {@link createInMemoryMosWebComposition}. */
export interface InMemoryMosWebCompositionOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Tenant/workspace the shell presents. */
  readonly tenantId?: string;
  readonly workspaceId?: string | null;
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
}

const DEMO_TENANT_ID = 'tenant-demo';
const DEMO_WORKSPACE_ID = 'ws_demo';

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
    tenantId,
    workspaceId,
  });
  const catalogDouble = createInMemoryMissionCatalogPort({
    missionRepository,
    now,
  });

  return {
    appShell,
    missionCatalog: catalogDouble.port,
    identityRepository,
    missionRepository,
    recordedIntents: catalogDouble.recordedIntents,
    scope: { tenantId, workspaceId },
  };
}

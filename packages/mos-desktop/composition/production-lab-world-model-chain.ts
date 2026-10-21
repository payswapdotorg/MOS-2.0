import type { TenantScope } from '@mos/contracts';
import type { SocialWorldModelStore } from '@mos/lab';
import { createInMemorySocialWorldModelStore } from '../../mos-lab/dist/index.js';
import type { LabSimulatorOverviewView } from '@mos/web';

/**
 * UX-003 wave 3 (the lab-intent write transport): the world-model chain
 * index — the disclosed chain-indexing wrapper pattern
 * production-lab-surface.ts established for benchmark/calibration chains,
 * split to its own module for the 400-line budget.
 *
 * World-model REGISTRATION through this composition's runtime instance
 * feeds the tenant-scoped id index the simulator read model presents.
 * Reads pass through to the REAL store unchanged; a fresh composition
 * stays honestly empty (an empty index — never a fabricated example).
 */

/** The tenant-scoped world-model chain index. */
export interface WorldModelChainIndex {
  /** The indexing wrapper over the REAL store (the runtime to compose). */
  readonly store: SocialWorldModelStore;
  /** The ids a tenant's scope has registered through this composition. */
  readonly idsFor: (tenantId: string) => readonly string[];
}

/** Wraps the real world-model store with the tenant-scoped id index. */
export function createIndexedWorldModelStore(): WorldModelChainIndex {
  const coreWorldModels = createInMemorySocialWorldModelStore();
  const idsByTenant = new Map<string, Set<string>>();
  const index = (scope: TenantScope, id: string): void => {
    const ids = idsByTenant.get(String(scope.tenantId)) ?? new Set<string>();
    ids.add(id);
    idsByTenant.set(String(scope.tenantId), ids);
  };
  const store: SocialWorldModelStore = {
    registerWorldModel: (input) =>
      coreWorldModels.registerWorldModel(input).then((result) => {
        if (!('error' in result)) {
          index(input.scope, String(result.id));
        }
        return result;
      }),
    getWorldModel: (scope, id, worldModelVersion) =>
      coreWorldModels.getWorldModel(scope, id, worldModelVersion),
    resolveLatestWorldModel: (scope, id) => coreWorldModels.resolveLatestWorldModel(scope, id),
    listWorldModelVersions: (scope, id) => coreWorldModels.listWorldModelVersions(scope, id),
  };
  return {
    store,
    idsFor: (tenantId: string) => [...(idsByTenant.get(tenantId) ?? [])],
  };
}

/**
 * Projects the indexed ids into the simulator overview's world-model rows
 * (per-id latest resolution — never an enumerate-all the runtime does not
 * expose). Counterfactual disclosure is pinned per row: the parametric
 * world models are SYNTHETIC.
 */
export async function projectWorldModelRows(
  worldModels: SocialWorldModelStore,
  ids: readonly string[],
  scope: TenantScope,
): Promise<LabSimulatorOverviewView['worldModels']> {
  type WorldModelView = LabSimulatorOverviewView['worldModels'][number];
  const rows: WorldModelView[] = [];
  for (const id of ids) {
    const latest = await worldModels.resolveLatestWorldModel(scope, id as never);
    if (latest === null) {
      continue;
    }
    rows.push({
      worldModelId: String(latest.id),
      worldModelVersion: latest.worldModelVersion,
      tenantId: latest.tenantId,
      niche: latest.niche,
      platform: latest.platform,
      state: {
        baseAudience: latest.state.baseAudience,
        fatigue: latest.state.fatigue,
        competitorShare: latest.state.competitorShare,
        seasonalFactor: latest.state.seasonalFactor,
      },
      createdAt: latest.createdAt,
      notes: latest.notes,
      disclosure: 'synthetic-parametric-world-model',
      counterfactual: true,
    });
  }
  return rows;
}

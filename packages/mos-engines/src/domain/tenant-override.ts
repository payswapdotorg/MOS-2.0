/**
 * Tenant override resolution (ENG-001).
 *
 * spec/mos-engine-policy-v2.0.yaml `engineSelection`:
 *   tenantOverridesAllowed: true
 *
 * A tenant override pins one engine version for one tenant WITHOUT
 * touching the default lane. The target must be registered, ACTIVATED
 * (the activation gate cannot be bypassed per-tenant), and must declare
 * the requested capability — otherwise the override fails closed with the
 * named reason.
 */

import type { CapabilityId, Engine, EngineId, TenantId, Version } from "@mos/contracts";

import { EngineRegistryError } from "./errors.js";

/** A tenant override pin (structural; the port's record satisfies it). */
export interface TenantOverridePin {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
}

/** The registry view of one engine entry the override lane needs. */
export interface EngineEntryView {
  readonly engine: Engine;
  readonly active: boolean;
}

/**
 * Validates a tenant override and returns its target entry. Fail-closed:
 * `unknown-engine`, `tenant-override-target-not-activated`, or
 * `no-activatable-engine` (target does not declare the capability).
 */
export function tenantOverrideTarget(
  capabilityId: CapabilityId,
  tenantId: TenantId,
  override: TenantOverridePin,
  lookup: (engineId: EngineId, engineVersion: Version) => EngineEntryView | undefined,
): EngineEntryView {
  const target = lookup(override.engineId, override.engineVersion);
  if (target === undefined) {
    throw new EngineRegistryError(
      "unknown-engine",
      `Tenant override target engine ${override.engineId as string} version ${override.engineVersion as number} is not registered`,
      {
        tenantId: tenantId as string,
        engineId: override.engineId as string,
        engineVersion: override.engineVersion as number,
      },
    );
  }
  if (!target.active) {
    throw new EngineRegistryError(
      "tenant-override-target-not-activated",
      `Tenant override target engine ${override.engineId as string} version ${override.engineVersion as number} is registered but not activated`,
      {
        tenantId: tenantId as string,
        engineId: override.engineId as string,
        engineVersion: override.engineVersion as number,
      },
    );
  }
  if (!target.engine.capabilityIds.includes(capabilityId)) {
    throw new EngineRegistryError(
      "no-activatable-engine",
      `Tenant override target engine ${override.engineId as string} does not declare capability ${capabilityId as string}`,
      {
        tenantId: tenantId as string,
        engineId: override.engineId as string,
        capabilityId: capabilityId as string,
      },
    );
  }
  return target;
}

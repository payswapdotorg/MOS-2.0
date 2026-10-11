/**
 * COMMERCE-001 — construction helpers: injectable clock + id factory
 * (deterministic tests), own-property-safe clone-then-deep-freeze (D3/F1),
 * fail-closed finite guard (D5/F2 — THROWS on non-finite, never clamps).
 */
import type { TenantScope, Timestamp } from "@mos/contracts";

/** Injectable clock (ISO-8601 timestamp strings). */
export type CommerceDiscoveryClock = () => Timestamp;

export const commerceDiscoveryNowDefault = (): Timestamp =>
  new Date().toISOString() as Timestamp;

/** Injectable record-id factory. */
export type CommerceDiscoveryIdFactory = () => string;

export const commerceDiscoveryIdDefault = (): string =>
  `commerce-discovery:${crypto.randomUUID()}`;

/**
 * Own-property-safe clone-then-deep-freeze (D3/F1): JSON round-trip keeps
 * the result a plain data tree (prototype pollution payloads stay inert —
 * JSON.parse ignores __proto__-typed own keys) before Object.freeze seals
 * every level the traversal reaches.
 */
export const cloneAndDeepFreeze = <T>(value: T): T => {
  const cloned: T = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (node: unknown): void => {
    if (node && typeof node === "object" && !Object.isFrozen(node)) {
      Object.freeze(node);
      for (const key of Object.keys(node)) {
        freeze((node as Record<string, unknown>)[key]);
      }
    }
  };
  freeze(cloned);
  return cloned;
};

/**
 * D5/F2 finite-number guard: throws on NaN/Infinity/out-of-range —
 * NEVER clamps (a clamping guard silently invents data).
 */
export const finiteGuard = (
  value: number,
  min: number,
  max: number,
  label: string,
): number => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(
      `${label} must be a finite number in [${min}, ${max}]: got ${String(value)}`,
    );
  }
  return value;
};

/**
 * D4: a frozen TenantScope copy per operation — callers never hand out
 * their live scope object into a record.
 */
export const frozenTenantScope = (scope: TenantScope): TenantScope =>
  cloneAndDeepFreeze(scope);

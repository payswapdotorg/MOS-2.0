/**
 * Clone-then-freeze ownership support for studio-side stores/registries
 * (W10-B — the W9-B D3 defect-class fix applied to the Wave 9 surfaces).
 *
 * The discipline is the mos-production `registry-support.ts` precedent: a
 * store keeps a PRIVATE structural copy of the caller's declaration, deeply
 * frozen — the caller's objects are never aliased by stored state (a
 * post-submission mutation cannot rewrite history) and never frozen in
 * place (no ownership violation).
 *
 * Two clones exist because format plugins carry FUNCTIONS
 * (`validateSessionInput`): `structuredClone` throws on functions, so
 * plugins use the function-aware structural clone (functions kept by
 * reference — a frozen declaration tree with the caller's validator), while
 * pure-data records (edit graphs, script graphs) use `structuredClone`.
 */

import type { StudioFormatPlugin } from "../contracts/studio-format.js";

/**
 * Recursively freeze one value (arrays item-wise, objects key-wise;
 * cycle-safe — already-frozen nodes are skipped). Functions are left alone
 * (freezing a function is harmless but pointless; plugin validators are
 * carried by reference).
 */
export function deepFreezeValue<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreezeValue(item, seen);
    }
    return Object.freeze(value);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreezeValue((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

/**
 * Clone-then-deep-freeze one PURE-DATA value (no functions): the stored
 * record owns a private copy — the caller's objects are never frozen in
 * place and never aliased by the store (the W4-B/W8-A/W9-B discipline).
 */
export function cloneThenFreezeValue<T>(value: T): T {
  return deepFreezeValue(structuredClone(value));
}

/**
 * Clone-then-freeze one format plugin (FUNCTION-AWARE): every JSON-shaped
 * declaration aspect is cloned + deeply frozen; the `validateSessionInput`
 * hook is kept by reference (a function cannot be structurally cloned, and
 * the plugin contract makes the validator the registrant's own). A caller
 * mutating its retained plugin object after registration/flow-creation
 * cannot move the stored declaration data.
 */
export function cloneThenFreezeFormatPlugin(plugin: StudioFormatPlugin): StudioFormatPlugin {
  const clone = clonePluginShape(plugin, new Map());
  return deepFreezeValue(clone) as StudioFormatPlugin;
}

/** Structural clone of a plugin's declaration tree (functions by reference, cycle-safe). */
function clonePluginShape(value: unknown, seen: Map<object, unknown>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (typeof value === "function") {
    return value;
  }
  const already = seen.get(value as object);
  if (already !== undefined) {
    return already;
  }
  const copy: unknown[] | Record<string, unknown> = Array.isArray(value) ? [] : {};
  seen.set(value as object, copy);
  if (Array.isArray(value) && Array.isArray(copy)) {
    for (const item of value) {
      copy.push(clonePluginShape(item, seen));
    }
    return copy;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    (copy as Record<string, unknown>)[key] = clonePluginShape(entry, seen);
  }
  return copy;
}

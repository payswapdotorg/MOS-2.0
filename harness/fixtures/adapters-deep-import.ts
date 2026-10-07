/**
 * VIOLATION fixture (rule b): deep @zcode imports inside the adapter root.
 * Static deep import (@zcode/rpc/dist/internal) and dynamic deep import
 * (@zcode/services/src/secret.ts) are both non-allowlisted entries — the
 * allowlist contains package entry names only, never subpaths.
 */
import type { Internal } from "@zcode/rpc/dist/internal";

export async function loadSecret(): Promise<unknown> {
  return import("@zcode/services/src/secret.ts");
}

export type Keep = Internal;

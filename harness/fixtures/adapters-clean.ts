/**
 * CLEAN fixture: the substrate-adapters adapter root is the ONLY place
 * where allowlisted @zcode entry imports are legal. Allowlisted entry
 * import + node builtins (both forms) + relative port import + dynamic
 * import of an allowlisted entry are all clean here.
 */
import type { IChannel } from "@zcode/rpc";
import type { Event } from "@zcode/shared";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { RpcPort } from "../ports/rpc.port.ts";

export async function lazyShared(): Promise<unknown> {
  const shared = await import("@zcode/shared");
  return shared;
}

export const surface = { IChannel, Event, createHash, fs, RpcPort };

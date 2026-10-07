/**
 * CLEAN fixture: a MOS domain package file with only allowed imports.
 * Also exercises bare node builtins, dynamic relative import, export-from,
 * and code that must NOT desync the tokenizer.
 */
import { createHash } from "node:crypto";
import fs from "fs";
import type { SomeContract } from "@mos/contracts";
import { helper } from "./helper.js";
import type { util } from "../shared/util.js";

export * from "../shared/util.js";

// import { fake } from "@zcode/rpc";  <- comment, must NOT be detected
/* import { alsoFake } from "openai";  <- block comment, must NOT be detected */

const url = "https://example.com/not-an-import";
const message = `template containing import x from "y" — never a real import`;
const tricky = /["']/g;
const ratio = total / count / other;
const html = "<div>import z from \"q\"</div>";

export async function lazy(): Promise<unknown> {
  const mod = await import("./lazy-helper.js");
  return mod;
}

export function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const uses = { fs, SomeContract, helper, util, url, message, tricky, ratio, html };

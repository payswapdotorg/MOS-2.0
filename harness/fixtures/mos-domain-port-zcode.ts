/**
 * VIOLATION fixture (rules a + b + d): a MOS DOMAIN port file importing
 * @zcode — the full violation stack on a single import:
 * MOS-DOMAIN-IMPORT-BOUNDARY/zcode-import,
 * ZCODE-ADAPTER-ONLY-IMPORTS/outside-adapter-root,
 * PORTS-NO-ZCODE/port-file-zcode-import.
 */
import type { AgentRuntimePort } from "@zcode/rpc";

export const runtime: AgentRuntimePort | undefined = undefined;

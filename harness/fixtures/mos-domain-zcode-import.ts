/**
 * VIOLATION fixture (rule a): @zcode/* import inside a MOS domain package.
 * Expected findings: MOS-DOMAIN-IMPORT-BOUNDARY/zcode-import AND
 * ZCODE-ADAPTER-ONLY-IMPORTS/outside-adapter-root (dual reporting is
 * intentional — each rule has its own remediation).
 */
import type { IChannel } from "@zcode/rpc";

export function makeChannel(): IChannel {
  throw new Error("fixture only");
}

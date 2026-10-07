/**
 * VIOLATION fixture (rule b + rule d): a PORT file importing @zcode.
 * Ports must stay substrate-free. Expected findings:
 * ZCODE-ADAPTER-ONLY-IMPORTS/outside-adapter-root AND
 * PORTS-NO-ZCODE/port-file-zcode-import (dual reporting is intentional).
 */
import type { IChannel } from "@zcode/rpc";

export interface FixturePort {
  channel?: IChannel;
}

/**
 * SessionEventsPort adapter skeleton — DISCLOSED INTERFACE-STAGE STUB.
 *
 * MOS v2.0 (W0-B / BOOT-003). This is NOT a working adapter. The ZCode
 * session/eventing mechanics binding is scheduled for follow-up work item
 * AGT-003 (Agent Organization), which defines the organization-level
 * session semantics MOS actually needs on top of the substrate. Until then
 * this skeleton throws {@link SubstrateAdapterNotBoundError} on construct
 * and on every method. Never represent this object as a working
 * SessionEventsPort.
 */

import { SubstrateAdapterNotBoundError } from "../errors.ts";
import type {
  SessionCloseResult,
  SessionEventSubscription,
  SessionEventListener,
  SessionEventsPort,
  SessionOpenRequest,
  SessionSummary,
} from "../ports/session-events.port.ts";

const PORT_NAME = "SessionEventsPort";
const BINDING_WORK_ITEM = "AGT-003 (Agent Organization)";

function notBound(): never {
  throw new SubstrateAdapterNotBoundError(
    PORT_NAME,
    BINDING_WORK_ITEM,
    "The ZCode session lifecycle/eventing binding (open/close/subscribe) is not implemented in W0-B; only the MOS-owned port contract ships at this stage.",
  );
}

export class UnboundSessionEventsAdapter implements SessionEventsPort {
  constructor() {
    notBound();
  }

  openSession(_request: SessionOpenRequest): Promise<SessionSummary> {
    return notBound();
  }

  closeSession(_sessionId: string): Promise<SessionCloseResult> {
    return notBound();
  }

  subscribe(
    _sessionId: string,
    _listener: SessionEventListener,
  ): Promise<SessionEventSubscription> {
    return notBound();
  }
}

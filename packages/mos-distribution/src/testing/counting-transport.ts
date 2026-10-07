/**
 * Test instrumentation: a SEND-COUNTING transport wrapper.
 *
 * Wraps any {@link SocialTransportPort} and counts every `send` — the
 * test battery's structural pin that DENIED rights/policy evaluations and
 * capability-matrix refusals NEVER reach the transport seam (the
 * backlog's "rights/policy gates precede provider calls" acceptance).
 */

import type { SocialTransportPort } from "../ports/social-transport.port.js";
import type {
  SocialTransportRequest,
  SocialTransportResponse,
} from "../ports/social-transport.port.js";

/** A transport wrapper that counts sends (test instrumentation only). */
export interface CountingTransport extends SocialTransportPort {
  /** How many sends reached the wrapped transport. */
  sentCount(): number;
}

/** Wraps `inner` with send counting. */
export function createCountingTransport(inner: SocialTransportPort): CountingTransport {
  let count = 0;
  const wrapper: CountingTransport = {
    send(request: SocialTransportRequest): SocialTransportResponse {
      count += 1;
      return inner.send(request);
    },
    sentCount(): number {
      return count;
    },
  };
  return wrapper;
}

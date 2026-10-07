/**
 * DISCLOSED TEST DOUBLE — in-memory JobEventSinkPort (ENG-003).
 *
 * ⚠ TEST DOUBLE ONLY — NEVER PRODUCTION JOB INFRASTRUCTURE ⚠
 *
 * Records every lifecycle event the runner emits (queued → running →
 * succeeded | failed | timed_out, completion events carrying the full §30
 * observability record). This is the seam where the durable job system
 * (mos-jobs, later wave) subscribes; the double simply keeps the events
 * for inspection so the event contract and the §30 record completeness
 * are testable.
 */

import type {
  JobCompletedEvent,
  JobEvent,
  JobEventSinkPort,
} from "../ports/job-event-sink.port.js";

/** The in-memory sink: the port plus test-facing accessors. */
export interface InMemoryJobEventSink extends JobEventSinkPort {
  /** Every event, in emission order. */
  readonly events: readonly JobEvent[];
  /** Only the completion events (succeeded/failed/timed-out). */
  readonly completions: readonly JobCompletedEvent[];
  /** Events for one job, in order. */
  eventsFor(jobId: string): readonly JobEvent[];
}

/**
 * Creates the DISCLOSED in-memory job event sink.
 */
export function createInMemoryJobEventSink(): InMemoryJobEventSink {
  const events: JobEvent[] = [];

  const sink: InMemoryJobEventSink = {
    onJobEvent(event: JobEvent): void {
      events.push(event);
    },

    get events(): readonly JobEvent[] {
      return events;
    },

    get completions(): readonly JobCompletedEvent[] {
      return events.filter(
        (event): event is JobCompletedEvent =>
          event.type === "job-succeeded" ||
          event.type === "job-failed" ||
          event.type === "job-timed-out",
      );
    },

    eventsFor(jobId: string): readonly JobEvent[] {
      return events.filter((event) => event.jobId === jobId);
    },
  };

  return sink;
}

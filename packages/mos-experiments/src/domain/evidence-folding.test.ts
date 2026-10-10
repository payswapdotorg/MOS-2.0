/**
 * BRIDGE-003 evidence-folding tests — the pure platform-said observation
 * selection + citation projection + §22 uncertainty + purity guards.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evidenceUncertaintyOf,
  observationCitationsOf,
  observationPurityViolations,
  observationsWithinWindow,
} from "./evidence-folding.js";
import {
  experimentObservationFixture,
  experimentWindowObservations,
} from "../testing/experiment-fixtures.js";

const WINDOW = { windowStart: "2026-06-01T00:00:00.000Z", windowEnd: "2026-06-08T00:00:00.000Z" };

test("observations within the window are selected in ascending observedAt order", () => {
  const within = observationsWithinWindow(experimentWindowObservations(), WINDOW, "platform-post:experiment-1");
  assert.equal(within.length, 5);
  for (let index = 1; index < within.length; index += 1) {
    const previous = within[index - 1];
    const current = within[index];
    assert.ok(previous !== undefined && current !== undefined);
    assert.ok(Date.parse(String(previous.observedAt)) <= Date.parse(String(current.observedAt)));
  }
});

test("observations of ANOTHER subject are never folded", () => {
  const foreign = experimentObservationFixture("social-obs:foreign", "2026-06-02T00:00:00.000Z", {
    reach: 1,
  });
  (foreign as unknown as { subjectRef: string }).subjectRef = "platform-post:other";
  const within = observationsWithinWindow([foreign, ...experimentWindowObservations()], WINDOW, "platform-post:experiment-1");
  assert.equal(within.length, 5);
});

test("the window is start-inclusive and end-exclusive", () => {
  const atStart = experimentObservationFixture("social-obs:at-start", WINDOW.windowStart, { v: 1 });
  const atEnd = experimentObservationFixture("social-obs:at-end", WINDOW.windowEnd, { v: 2 });
  const within = observationsWithinWindow([atStart, atEnd], WINDOW, "platform-post:experiment-1");
  assert.equal(within.length, 1);
  assert.equal(String(within[0]?.id), "social-obs:at-start");
});

test("the citation projection copies every field VERBATIM (never adjusted)", () => {
  const observations = experimentWindowObservations();
  const citations = observationCitationsOf(observations);
  const first = citations[0];
  const original = observations[0];
  assert.ok(first !== undefined && original !== undefined);
  assert.equal(first.observationId, String(original.id));
  assert.equal(first.channelRef, String(original.channelRef));
  assert.equal(first.providerId, String(original.providerId));
  assert.equal(first.subjectRef, String(original.subjectRef));
  assert.deepEqual(first.reported, original.reported);
  assert.equal(first.observedAt, original.observedAt);
  assert.deepEqual(first.providerRefs, [...original.providerRefs]);
  assert.equal(first.source, original.source);
  // The payload is a PRIVATE copy — mutating the original moves nothing.
  (original.reported as Record<string, number>)["qualified-reach"] = 99999;
  assert.deepEqual(first.reported, { "qualified-reach": 1200, "engagement-rate": 0.045 });
});

test("the §22 uncertainty heuristic is deterministic over the folded count", () => {
  assert.equal(evidenceUncertaintyOf([]).level, "high");
  const one = observationCitationsOf(experimentWindowObservations().slice(0, 1));
  assert.equal(evidenceUncertaintyOf(one).level, "high");
  const two = observationCitationsOf(experimentWindowObservations().slice(0, 2));
  assert.equal(evidenceUncertaintyOf(two).level, "moderate");
  const four = observationCitationsOf(experimentWindowObservations().slice(0, 4));
  assert.equal(evidenceUncertaintyOf(four).level, "moderate");
  const five = observationCitationsOf(experimentWindowObservations());
  assert.equal(evidenceUncertaintyOf(five).level, "low");
  assert.equal(evidenceUncertaintyOf(five).observationCount, 5);
  assert.equal(evidenceUncertaintyOf(five).distinctProviders, 1);
  assert.ok(evidenceUncertaintyOf(five).note.includes("declared v1 heuristic"));
});

test("the purity guard names blank ids, scalar payloads and blank source labels", () => {
  const violations = observationPurityViolations([
    {
      observationId: "  ",
      channelRef: "c",
      providerId: "p",
      subjectRef: "s",
      reported: 42 as never,
      observedAt: "2026-06-02T00:00:00.000Z" as never,
      recordedAt: "2026-06-02T00:00:00.000Z" as never,
      providerRefs: [],
      source: "  ",
    },
  ]);
  assert.equal(violations.length, 3);
  assert.ok(violations.some((violation) => violation.includes("REAL observation record")));
  assert.ok(violations.some((violation) => violation.includes("platform's own JSON payload")));
  assert.ok(violations.some((violation) => violation.includes("transport source label")));
});

test("pure platform-said citations pass the guard with zero violations", () => {
  const citations = observationCitationsOf(experimentWindowObservations());
  assert.deepEqual(observationPurityViolations(citations), []);
});

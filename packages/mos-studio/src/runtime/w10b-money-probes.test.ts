import assert from "node:assert/strict";
import { test } from "node:test";

import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import {
  InvalidStudioMoneyError,
  sumStudioMoney,
  validateStudioMoneyAmount,
} from "./money.js";
import {
  OPERATOR,
  buildProcessingArtifacts,
  captureRawTake,
  createSessionReadyForCapture,
  mustOk,
  participantJoin,
} from "../testing/test-fixtures.js";
import {
  composeFormatFlowScenario,
  onePersonReactionPlan,
  onePersonVideoPlan,
  PREDICTED_SESSION_ID,
} from "../testing/format-flow-fixtures.js";
import {
  composePodcastScenario,
  onePersonPlan,
  PREDICTED_SESSION_ID as AUDIO_PREDICTED_SESSION_ID,
} from "../testing/podcast-flow-fixtures.js";
import type { MoneyAmount } from "../contracts/refs.js";

// ---------------------------------------------------------------------------
// W10-B money-integrity probes (the W9-C dropped-cost defect class — the
// explicit review hazard): every path where a declared processing cost meets
// an engine cost must sum honestly, and hostile money must FAIL CLOSED TYPED
// (never silently summed, never an untyped crash after the session ran).
// ---------------------------------------------------------------------------

test("W10-B money probe: sumStudioMoney sums valid decimal strings exactly (multi-scale)", () => {
  assert.deepEqual(sumStudioMoney({ currency: "USD", amount: "0.12" }, { currency: "USD", amount: "0.55" }), {
    currency: "USD",
    amount: "0.67",
  });
  assert.deepEqual(sumStudioMoney({ currency: "USD", amount: "0.1" }, { currency: "USD", amount: "0.02" }), {
    currency: "USD",
    amount: "0.12",
  });
  assert.deepEqual(sumStudioMoney({ currency: "EUR", amount: "1" }, { currency: "EUR", amount: "2" }), {
    currency: "EUR",
    amount: "3.00",
  });
});

test("W10-B money probe: hostile amounts fail closed in the validator and throw the NAMED error in the sum", () => {
  const hostile: readonly unknown[] = [
    { currency: "USD", amount: "-5.00" }, // negative
    { currency: "USD", amount: "+5.00" }, // signed
    { currency: "USD", amount: "0.5.5" }, // multi-dot (silently truncated pre-fix)
    { currency: "USD", amount: "abc" }, // garbage (BigInt SyntaxError pre-fix)
    { currency: "USD", amount: "1e3" }, // exponential (BigInt SyntaxError pre-fix)
    { currency: "USD", amount: " 1.00" }, // leading whitespace
    { currency: "USD", amount: "NaN" }, // NaN-shaped
    { currency: "USD", amount: "" }, // empty
    { currency: "USD", amount: Number.NaN }, // not a string at all
    { currency: "", amount: "1.00" }, // blank currency
    { currency: "USD" }, // missing amount
    null, // not an object
  ];
  for (const value of hostile) {
    const fault = validateStudioMoneyAmount(value);
    assert.ok(fault !== null, `hostile money must fail validation: ${JSON.stringify(String(value))}`);
    assert.ok(fault.length > 0);
  }
  assert.equal(validateStudioMoneyAmount({ currency: "USD", amount: "0.00" }), null);
  assert.equal(validateStudioMoneyAmount({ currency: "USD", amount: "12" }), null);

  // The shared sum itself fails closed with the NAMED error (defense in
  // depth — never a silent mis-sum, never a deep BigInt crash).
  assert.throws(
    () => sumStudioMoney({ currency: "USD", amount: "0.10" }, { currency: "USD", amount: "-1.00" }),
    InvalidStudioMoneyError,
  );
  assert.throws(
    () => sumStudioMoney({ currency: "USD", amount: "0.10" }, { currency: "USD", amount: "0.5.5" }),
    InvalidStudioMoneyError,
  );
  assert.throws(
    () => sumStudioMoney({ currency: "USD", amount: "0.10" }, { currency: "EUR", amount: "0.10" }),
    (error: unknown) => error instanceof InvalidStudioMoneyError && error.message.includes("currency mismatch"),
    "costs never sum across currencies",
  );
});

test("W10-B money probe: a NEGATIVE declared processing cost fails the reaction flow TYPED before any session exists", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonReactionPlan(scenario, {
    processingCost: { currency: "USD", amount: "-500.00" },
  });
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(!result.ok, "a negative declared cost must fail the flow closed");
  assert.equal(result.error.kind, "invalid-processing-cost");
  assert.ok(result.error.reason.includes("non-negative"));
  // NOTHING ran: no session, no engine job (fail-closed at the flow gate).
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined);
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
});

test("W10-B money probe: GARBAGE amount strings fail the reaction flow TYPED (never an untyped internal crash)", async () => {
  const scenario = composeFormatFlowScenario();
  for (const amount of ["0.5.5", "abc", "1e3", "NaN"]) {
    const plan = await onePersonReactionPlan(scenario, {
      processingCost: { currency: "USD", amount },
    });
    const result = await scenario.reactionFlow.run(plan);
    assert.ok(!result.ok, `the garbage amount "${amount}" must fail the flow closed`);
    assert.equal(
      result.error.kind,
      "invalid-processing-cost",
      `the failure must be TYPED for "${amount}" (got: ${JSON.stringify(result.error)})`,
    );
  }
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined);
});

test("W10-B money probe: a CURRENCY-MISMATCHED declared cost fails the reaction flow TYPED at the sum (never silently confused)", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonReactionPlan(scenario, {
    processingCost: { currency: "EUR", amount: "10.00" },
  });
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(!result.ok, "an EUR declared cost against the USD editing cost must fail closed");
  assert.equal(result.error.kind, "invalid-processing-cost");
  assert.ok(result.error.reason.includes("currency"), `the failure must name the currency mismatch: ${JSON.stringify(result.error)}`);
  // The run reached the editing session (the currency is only resolvable
  // against the engine cost there) — but NOTHING was packaged.
  const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 0);
});

test("W10-B money probe: the video-podcast flow fails hostile declared costs TYPED (negative, garbage, currency mismatch)", async () => {
  const scenario = composeFormatFlowScenario();
  const cases: readonly { readonly amount: string; readonly currency: string; readonly beforeSession: boolean }[] = [
    { amount: "-1.00", currency: "USD", beforeSession: true },
    { amount: "0.5.5", currency: "USD", beforeSession: true },
    { amount: "1e3", currency: "USD", beforeSession: true },
    { amount: "0.55", currency: "EUR", beforeSession: false },
  ];
  for (const [index, hostile] of cases.entries()) {
    // A fresh scenario per case: the deterministic session id repeats.
    const fresh = index === 0 ? scenario : composeFormatFlowScenario();
    const plan = await onePersonVideoPlan(fresh, {
      processingCost: { currency: hostile.currency, amount: hostile.amount },
    });
    const result = await fresh.videoPodcastFlow.run(plan);
    assert.ok(!result.ok, `the hostile cost must fail the video flow closed: ${JSON.stringify(hostile)}`);
    assert.equal(result.error.kind, "invalid-processing-cost");
    if (hostile.beforeSession) {
      assert.equal(fresh.runtime.getSession(PREDICTED_SESSION_ID), undefined, "no session may exist");
    } else {
      const view = fresh.runtime.getSession(PREDICTED_SESSION_ID);
      assert.ok(view !== undefined);
      assert.equal(view.packages.length, 0, "nothing may be packaged");
    }
  }
});

test("W10-B money probe: the audio-podcast flow (its own recorder) fails hostile declared costs TYPED before any session exists", async () => {
  const scenario = composePodcastScenario();
  for (const amount of ["-0.42", "0.5.5", "abc"]) {
    const plan = await onePersonPlan(scenario, {
      processingCost: { currency: "USD", amount },
    });
    const result = await scenario.flow.run(plan);
    assert.ok(!result.ok, `the hostile cost must fail the audio flow closed: "${amount}"`);
    assert.equal(
      result.error.kind,
      "invalid-processing-cost",
      `typed failure expected for "${amount}" (got: ${JSON.stringify(result.error)})`,
    );
  }
  assert.equal(scenario.runtime.getSession(AUDIO_PREDICTED_SESSION_ID), undefined, "no session may exist");
  // The declared cost still lands when it is honest (never dropped — the
  // W9-C defect class re-pinned on the recorder path).
  const honest = await scenario.flow.run(
    await onePersonPlan(scenario, { processingCost: { currency: "USD", amount: "0.42" } }),
  );
  assert.ok(honest.ok, `the honest audio run must succeed: ${JSON.stringify(honest)}`);
  assert.equal(honest.value.package.cost.total.amount, "0.42");
  assert.equal(honest.value.package.cost.total.currency, "USD");
});

test("W10-B money probe: the runtime's completeProcessing intake rejects hostile additionalCost + processingSeconds TYPED (and stays unpoisoned)", async () => {
  const { runtime, artifactFactory, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(artifactFactory, [rawArtifact]);
  await mustOk(runtime.beginProcessing(sessionId), "beginProcessing");

  const hostileCases: readonly { readonly additionalCost?: MoneyAmount; readonly processingSeconds?: number }[] = [
    { additionalCost: { currency: "USD", amount: "-1.00" } },
    { additionalCost: { currency: "USD", amount: "0.5.5" } },
    { additionalCost: { currency: "USD", amount: "garbage" } },
    { additionalCost: { currency: "", amount: "1.00" } },
    { processingSeconds: Number.NaN },
    { processingSeconds: -30 },
    { processingSeconds: Number.POSITIVE_INFINITY },
  ];
  for (const hostile of hostileCases) {
    const outcome = await runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      ...hostile,
    });
    assert.ok(!outcome.ok, `the hostile processing output must fail closed: ${JSON.stringify(hostile)}`);
    assert.equal(outcome.error.kind, "invalid-processing-output");
    const reasons = (outcome.error as { reasons: readonly string[] }).reasons;
    assert.ok(reasons.length > 0);
  }
  // The failed attempts poisoned nothing: a VALID output still completes on
  // the same session (state untouched by the rejections).
  const valid = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: intermediate,
    finalArtifacts: finals,
    additionalCost: { currency: "USD", amount: "1.25" },
    processingSeconds: 30,
  });
  assert.ok(valid.ok, `the valid completion must succeed: ${JSON.stringify(valid)}`);
});

test("W10-B money probe: a second cost line in a FOREIGN currency is rejected TYPED (costs never mix currencies)", async () => {
  const { runtime, artifactFactory, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(artifactFactory, [rawArtifact]);
  await mustOk(runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      additionalCost: { currency: "USD", amount: "1.00" },
    }),
    "first USD line",
  );
  // request-treatment bounces the session back into processing — a second
  // cost line becomes expressible (the treatment-branch discipline).
  await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "request-treatment",
      decidedBy: OPERATOR,
    }),
    "request treatment",
  );
  const foreign = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: intermediate,
    finalArtifacts: finals,
    additionalCost: { currency: "EUR", amount: "2.00" },
  });
  assert.ok(!foreign.ok, "an EUR second line against the recorded USD session cost must fail closed");
  assert.equal(foreign.error.kind, "invalid-processing-output");
  assert.ok(
    (foreign.error as { reasons: readonly string[] }).reasons.some((reason) => reason.includes("never mix currencies")),
    `the rejection must name the currency rule: ${JSON.stringify(foreign.error)}`,
  );
  // The honest same-currency second line is still accepted (not over-strict).
  const honest = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: intermediate,
    finalArtifacts: finals,
    additionalCost: { currency: "USD", amount: "2.00" },
  });
  assert.ok(honest.ok, `the same-currency second line must complete: ${JSON.stringify(honest)}`);
  const accepted = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    }),
    "submitReview",
  );
  assert.ok(accepted.package !== undefined);
  assert.deepEqual(accepted.package.cost.total, { currency: "USD", amount: "3.00" });
});

test("W10-B ownership probe: the caller's additionalCost object is never aliased into stored session state", async () => {
  const { runtime, artifactFactory, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(artifactFactory, [rawArtifact]);
  await mustOk(runtime.beginProcessing(sessionId), "beginProcessing");
  const declaredCost: MoneyAmount = { currency: "USD", amount: "1.25" };
  const completed = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: intermediate,
    finalArtifacts: finals,
    additionalCost: declaredCost,
  });
  assert.ok(completed.ok);
  // The caller rewrites its own object AFTER submission (post-hoc cost forgery).
  (declaredCost as { amount: string }).amount = "0.01";
  const accepted = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    }),
    "submitReview",
  );
  assert.ok(accepted.package !== undefined);
  assert.deepEqual(
    accepted.package.cost.total,
    { currency: "USD", amount: "1.25" },
    "the packaged cost must reflect the DECLARED value, not the post-hoc mutation",
  );
});

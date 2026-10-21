import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryMosWebComposition } from "./compose-in-memory-mos-web.js";
import type { LabIntentActionId } from "../dist/src/ports/lab-intents.js";
import {
  declareLabIntentThroughPort,
  labIntentOutcomeHref,
} from "../dist/src/routes/lab-intent-declaration.js";

/**
 * Lab write-intent transport tests (UX-003 wave 3) over the DISCLOSED
 * testing double: every declaration lands in the ledger with its verdict;
 * the ingest path fails closed on the rights gate exactly like production;
 * declared-JSON parse failures carry the named shell-side codes; ledger
 * reads are tenant-scoped; the navigation outcome targets the owning
 * section with the receipt marker.
 */

const NOW = "2026-10-21T12:00:00.000Z";
const SCOPE = { tenantId: "tenant-demo" as never, workspaceId: "ws_demo" as never };

const composition = createInMemoryMosWebComposition({ now: () => NOW });

test("ingest fails closed on the rights gate with the authority verdict verbatim", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "ingest-reference-document",
    documentId: "doc-1",
    niche: "developer-marketing",
    platform: "mastodon",
    modality: "text",
    artifactId: "artifact-1",
    sourceRefsText: "https://example.com/source",
    acquiredAt: NOW,
    rightsRef: "rights-ref-1",
    provenanceRef: "prov-1",
  });
  if (!("error" in outcome.record.outcome)) {
    assert.fail("ingest without a rights grant must fail closed");
  }
  assert.equal(outcome.record.outcome.error, "rights-not-granted");
  assert.match(outcome.record.outcome.message, /fails closed/);
  assert.equal(outcome.record.routedTo, "lab-corpus-authority");
  assert.equal(outcome.record.action, "ingest-reference-document");
});

test("the rights-gated rejection navigates to the corpus section with the receipt marker", () => {
  const href = labIntentOutcomeHref({
    record: {
      intentId: "lab-intent-0001",
      action: "ingest-reference-document",
      declaredAt: NOW,
      routedTo: "lab-corpus-authority",
      outcome: {
        intentId: "lab-intent-0001",
        action: "ingest-reference-document",
        declaredAt: NOW,
        routedTo: "lab-corpus-authority",
        error: "rights-not-granted",
        message: "denied",
      },
    },
  });
  assert.equal(href, "/lab?section=corpus&receipt=lab-intent-0001");
});

test("a snapshot declaration executes and echoes the membership count", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "snapshot-corpus-version",
    documentRefsText: "doc-1, doc-2",
  });
  if ("error" in outcome.record.outcome) {
    assert.fail("snapshot should execute over the fixture double");
  }
  assert.equal(outcome.record.outcome.authorityEcho.recordVersion, 3);
  assert.match(outcome.record.outcome.authorityEcho.summary, /2 document refs/);
});

test("declared-JSON parse failures carry the named shell-side code", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "simulate-step",
    worldModelId: "wm-1",
    worldModelVersion: 1,
    seed: 42,
    step: 0,
    scenarioJson: "{not-json",
    candidateJson: '{"kind":"action"}',
  });
  if (!("error" in outcome.record.outcome)) {
    assert.fail("unparseable scenario JSON must be a named failure");
  }
  assert.equal(outcome.record.outcome.error, "lab-intent-json-invalid:scenarioJson");
  assert.match(outcome.record.outcome.message, /could not be parsed/);
});

test("a non-object declared JSON is rejected with the same named code", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "register-world-model",
    worldModelId: "wm-2",
    niche: "n",
    platform: "p",
    notesText: "",
    stateJson: "[1,2,3]",
  });
  if (!("error" in outcome.record.outcome)) {
    assert.fail("non-object declared JSON must be a named failure");
  }
  assert.equal(outcome.record.outcome.error, "lab-intent-json-invalid:stateJson");
  assert.match(outcome.record.outcome.message, /must be an object/);
});

test("the ledger records executed and rejected intents and reads back tenant-scoped", async () => {
  const executed = await declareLabIntentThroughPort(composition, {
    action: "run-benchmark",
    benchmarkId: "bench-1",
    seedsText: "1, 2, 3",
    scenarioJson: '{"id":"s","objective":"o"}',
    candidatesJson: "[]",
    rewardSpecJson: '{"version":1}',
    policyJson: '{"seeds":3}',
  });
  const record = await composition.labIntents.loadLabIntentLedgerRecord(
    executed.record.intentId,
    SCOPE,
  );
  assert.notEqual(record, null);
  assert.equal(record?.intentId, executed.record.intentId);
  // Cross-tenant ids resolve to null — never a leak (spec §31).
  const cross = await composition.labIntents.loadLabIntentLedgerRecord(executed.record.intentId, {
    tenantId: "tenant-other" as never,
    workspaceId: "ws_other" as never,
  });
  assert.equal(cross, null);
  // Unknown ids resolve to null (the honest not-found).
  assert.equal(await composition.labIntents.loadLabIntentLedgerRecord("nope", SCOPE), null);
});

test("a well-formed simulate-step declaration executes and stays counterfactual-labeled", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "simulate-step",
    worldModelId: "wm-social-reach",
    worldModelVersion: 2,
    seed: 42,
    step: 3,
    scenarioJson: '{"id":"scen-reach","objective":"grow"}',
    candidateJson: '{"kind":"action","cadencePerWeek":2}',
  });
  if ("error" in outcome.record.outcome) {
    assert.fail("a well-formed simulate-step should reach the authority");
  }
  assert.equal(outcome.record.routedTo, "lab-simulator-authority");
  assert.equal(outcome.record.outcome.authorityEcho.recordId, "wm-social-reach");
  assert.equal(outcome.record.outcome.authorityEcho.recordVersion, 2);
  assert.match(outcome.record.outcome.authorityEcho.summary, /counterfactual/);
  assert.match(outcome.record.outcome.authorityEcho.summary, /seed 42/);
});

test("a register-world-model declaration executes with the append-only first version", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "register-world-model",
    worldModelId: "wm-new-branch",
    niche: "developer-marketing",
    platform: "mastodon",
    notesText: "first declared registration",
    stateJson: '{"agents":8,"roles":["researcher","composer"]}',
  });
  if ("error" in outcome.record.outcome) {
    assert.fail("a well-formed registration should reach the authority");
  }
  assert.equal(outcome.record.routedTo, "lab-simulator-authority");
  assert.equal(outcome.record.outcome.authorityEcho.recordId, "wm-new-branch");
  assert.equal(outcome.record.outcome.authorityEcho.recordVersion, 1);
  assert.match(outcome.record.outcome.authorityEcho.summary, /developer-marketing\/mastodon/);
});

test("an organization-search declaration routes to the search authority and echoes the ensemble", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "search-organizations",
    ensembleId: "ensemble-reach-primary",
    ensembleVersion: 3,
    seed: 7,
    scenarioJson: '{"id":"scen-reach","objective":"grow"}',
    rewardSpecJson: '{"version":1}',
    candidatesJson: '{"candidates":[{"kind":"action"}]}',
    policyJson: '{"maxGenerations":4}',
  });
  if ("error" in outcome.record.outcome) {
    assert.fail("a well-formed organization search should reach the authority");
  }
  assert.equal(outcome.record.routedTo, "lab-organization-search-authority");
  assert.equal(outcome.record.outcome.authorityEcho.recordId, "ensemble-reach-primary");
  assert.equal(outcome.record.outcome.authorityEcho.recordVersion, 3);
});

test("a learn-strategy declaration routes to the strategy-learning authority", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "learn-strategy",
    ensembleId: "ensemble-reach-primary",
    ensembleVersion: 3,
    seed: 11,
    scenarioJson: '{"id":"scen-reach","objective":"grow"}',
    rewardSpecJson: '{"version":1}',
    initialProgramJson: '{"kind":"noop"}',
    stoppingPolicyJson: '{"maxIterations":50}',
  });
  if ("error" in outcome.record.outcome) {
    assert.fail("a well-formed learning declaration should reach the authority");
  }
  assert.equal(outcome.record.routedTo, "lab-strategy-learning-authority");
  assert.equal(outcome.record.outcome.authorityEcho.recordId, "ensemble-reach-primary");
  assert.equal(outcome.record.outcome.authorityEcho.recordVersion, 3);
});

test("a record-calibration-error declaration lands in the ledger with the calibration authority", async () => {
  const outcome = await declareLabIntentThroughPort(composition, {
    action: "record-calibration-error",
    calibrationId: "calib-reach-1",
    predictionJson: '{"benchmarkId":"bench-reach-v1","recordVersion":1}',
    observationRefsJson: '{"refs":["obs-reality-a","obs-reality-b"]}',
    rewardSpecJson: '{"version":1}',
    functionalJson: '{"functionalId":"calib-signed-error-v1"}',
    noteText: "declared from the calibration section form",
  });
  assert.equal(outcome.record.action, "record-calibration-error");
  assert.equal(outcome.record.routedTo, "lab-calibration-authority");
  const record = await composition.labIntents.loadLabIntentLedgerRecord(
    outcome.record.intentId,
    SCOPE,
  );
  assert.notEqual(record, null);
  assert.equal(record?.outcome.action, "record-calibration-error");
  const ledgerOutcome = record?.outcome;
  if (ledgerOutcome === undefined || "error" in ledgerOutcome) {
    assert.fail("the fixture authority should record the declared calibration error");
  }
  assert.equal(ledgerOutcome.authorityEcho.recordId, "calib-reach-1");
  assert.equal(ledgerOutcome.authorityEcho.recordVersion, 1);
});

test("every write-capable action outcome navigates to its OWNING section with the receipt marker", () => {
  const intentId = "lab-intent-0099";
  const hrefOf = (action: LabIntentActionId): string =>
    labIntentOutcomeHref({
      record: {
        intentId,
        action,
        declaredAt: NOW,
        routedTo: "lab-benchmark-authority",
        outcome: {
          intentId,
          action,
          declaredAt: NOW,
          routedTo: "lab-benchmark-authority",
          error: "declared",
          message: "the href maps the owning section, not the verdict",
        },
      },
    });
  assert.equal(hrefOf("ingest-reference-document"), "/lab?section=corpus&receipt=lab-intent-0099");
  assert.equal(hrefOf("snapshot-corpus-version"), "/lab?section=corpus&receipt=lab-intent-0099");
  assert.equal(hrefOf("register-world-model"), "/lab?section=simulator&receipt=lab-intent-0099");
  assert.equal(hrefOf("simulate-step"), "/lab?section=simulator&receipt=lab-intent-0099");
  assert.equal(hrefOf("search-organizations"), "/lab?section=strategy&receipt=lab-intent-0099");
  assert.equal(hrefOf("learn-strategy"), "/lab?section=strategy&receipt=lab-intent-0099");
  assert.equal(hrefOf("run-benchmark"), "/lab?section=benchmarks&receipt=lab-intent-0099");
  assert.equal(
    hrefOf("record-calibration-error"),
    "/lab?section=calibration&receipt=lab-intent-0099",
  );
});

test("the ledger observable lists every declaration with its verdict", async () => {
  const intents = composition.labIntents.recordedIntents();
  assert.ok(intents.length >= 5, "every declaration from this file is ledger-recorded");
  for (const record of intents) {
    assert.ok("error" in record.outcome || "authorityEcho" in record.outcome);
  }
});

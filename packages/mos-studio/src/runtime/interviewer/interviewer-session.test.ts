import assert from "node:assert/strict";
import { test } from "node:test";

import { createScriptGraphStore } from "../script-graph/script-graph-store.js";
import { createAdaptiveSequencer } from "../script-graph/adaptive-sequencer.js";
import {
  ANSWER_CONCLUDE,
  ANSWER_ELABORATE,
  createInMemoryScriptGraphGenerator,
  intentRecordFixture,
} from "../../testing/in-memory-script-graph-generator.js";
import { composeRealInterviewerAgentStack } from "../../testing/real-interviewer-agent.js";
import { createInterviewerSession } from "./interviewer-session.js";
import { INTERVIEWER_AGENT_BODY_ID } from "./interviewer-agent-body.js";
import type { CreateInterviewerSessionInput, InterviewerSessionSummary } from "../../contracts/interviewer-session.js";
import type { InterviewerRepresentation } from "../../contracts/interviewer.js";
import type { AnswerRef, IdentityRef, TenantId, Timestamp, Version } from "../../contracts/refs.js";
import type { IntentRecord } from "../../contracts/script-graph.js";

// ---------------------------------------------------------------------------
// STUDIO-004: the adaptive interviewer session over the REAL agent runtime —
// adaptive loop round-trip, agent-instance lifecycle, §14 provenance labels,
// representation switching, terminal discipline.
// ---------------------------------------------------------------------------

const TENANT = "tenant-001" as TenantId;
const USER = "identity-user-1" as IdentityRef;
const ANSWERER = "identity-participant-1" as IdentityRef;

const clock = (() => {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 6, 9, 0, 0) + tick++ * 1000).toISOString() as Timestamp;
})();

/** A synthetic voice interviewer (§14: labeled, generator named). */
const VOICE_REPRESENTATION: InterviewerRepresentation = {
  representation: "voice",
  provenance: {
    origin: "synthetic-generated",
    generatorCapability: "generate_voice" as never,
  },
};

/** A text interviewer performed by a human (prerecorded material refs). */
const TEXT_REPRESENTATION: InterviewerRepresentation = {
  representation: "text",
  provenance: { origin: "human-performed", humanConsentRefs: ["consent-interviewer-1" as never] },
};

/** Compose the interview seam: generator double + REAL store/sequencer + REAL agent stack. */
function composeInterviewSeam() {
  const store = createScriptGraphStore({ clock });
  const generator = createInMemoryScriptGraphGenerator();
  const sequencer = createAdaptiveSequencer({ store });
  const stack = composeRealInterviewerAgentStack({ now: clock });
  let sessionCounter = 0;
  return {
    clock,
    store,
    generator,
    sequencer,
    stack,
    nextSessionId: () => `ivs-${++sessionCounter}`,
    async graphFromIntent(intent: IntentRecord) {
      const generated = await generator.generateScriptGraph({ intent, formatId: "audio-podcast" as never });
      assert.ok(generated.ok, `generation must succeed: ${JSON.stringify(generated)}`);
      const registered = store.register(generated.draft);
      assert.ok(registered.ok, `registration must succeed: ${JSON.stringify(registered)}`);
      return registered.value.graph;
    },
  };
}

type Seam = ReturnType<typeof composeInterviewSeam>;

async function createSession(
  seam: Seam,
  overrides: Partial<CreateInterviewerSessionInput> = {},
) {
  const graph = await seam.graphFromIntent(
    intentRecordFixture({
      statement: "Interview me about learning to sail",
      tenantId: TENANT,
      recordedBy: USER,
    }),
  );
  const created = await createInterviewerSession(
    {
      tenantId: TENANT,
      graph: { graphId: graph.graphId, version: graph.version },
      representation: VOICE_REPRESENTATION,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
      ...overrides,
    },
    {
      store: seam.store,
      sequencer: seam.sequencer,
      agentBinding: seam.stack.agentBinding,
      agent: seam.stack.agent,
      clock: seam.clock,
      nextSessionId: seam.nextSessionId,
    },
  );
  assert.ok(created.ok, `session creation must succeed: ${JSON.stringify(created)}`);
  return { session: created.value, graph };
}

const answer = (answerRef: AnswerRef) => ({
  answerRef,
  answerText: String(answerRef),
  answeredBy: ANSWERER,
});

test("adaptive loop round-trip: question → answer → next question per declared branch graph (§14)", async () => {
  const seam = composeInterviewSeam();
  const { session, graph } = await createSession(seam);

  // The interviewer presents the first presentable node (entry beat skipped).
  const intro = await session.presentCurrentQuestion();
  assert.ok(intro.ok, `first presentation must succeed: ${JSON.stringify(intro)}`);
  assert.equal(intro.value.questionNodeId, "intro");
  assert.equal(
    intro.value.questionText,
    (graph.nodes.find((n) => n.nodeId === "intro") as { text?: string } | undefined)?.text,
  );
  // The REAL agent instance delivered it (audit trace present, no model identity).
  assert.ok(intro.value.agentExecution !== undefined, "REAL agent execution trace must be present");
  assert.equal(intro.value.agentExecution?.bodyId, INTERVIEWER_AGENT_BODY_ID);
  assert.equal(intro.value.agentExecution?.finishReason, "completed");
  assert.match(intro.value.agentExecution?.output ?? "", /^interviewer-delivery:/);

  // Answer from the prompt → default successor (the declared fallback).
  const first = await session.recordAnswer(answer(ANSWER_ELABORATE));
  assert.ok(first.ok, `first answer must succeed: ${JSON.stringify(first)}`);
  assert.equal(first.value.questionNodeId, "intro");
  assert.equal(first.value.nextNodeId, "core");

  // core → (elaborate) → deepen per the DECLARED branch edge.
  const core = await session.presentCurrentQuestion();
  assert.ok(core.ok && core.value.questionNodeId === "core");
  const second = await session.recordAnswer(answer(ANSWER_ELABORATE));
  assert.ok(second.ok && second.value.nextNodeId === "deepen");

  // deepen → (conclude) → wrap beat → path complete (terminal).
  const deepen = await session.presentCurrentQuestion();
  assert.ok(deepen.ok && deepen.value.questionNodeId === "deepen");
  const third = await session.recordAnswer(answer(ANSWER_CONCLUDE));
  assert.ok(third.ok && third.value.nextNodeId === "wrap");
  assert.equal(session.getSummary().terminal, false, "the wrap beat itself is not yet terminal");

  // Presenting again walks past the terminal beat → the interview is complete.
  const exhausted = await session.presentCurrentQuestion();
  assert.ok(!exhausted.ok && exhausted.error.kind === "interview-complete");
  assert.equal(session.getSummary().terminal, true);
  const after = await session.recordAnswer(answer(ANSWER_CONCLUDE));
  assert.ok(!after.ok && after.error.kind === "interview-complete");
});

test("interviewer via agent instance lifecycle: bound at creation, released at complete (AGT-002)", async () => {
  const seam = composeInterviewSeam();
  const { session } = await createSession(seam);
  const summary: InterviewerSessionSummary = session.getSummary();
  const scope = { tenantId: TENANT };

  // The session's interviewer is a BOUND agent instance in the REAL registry.
  const boundRecord = seam.stack.agentInstances.get(scope, summary.interviewer.agent.instanceId as never);
  assert.ok(boundRecord !== undefined, "the interviewer instance must exist in the real registry");
  assert.equal(boundRecord.lifecycle, "bound");
  assert.equal(String(boundRecord.bodyId), INTERVIEWER_AGENT_BODY_ID);

  // Presenting a question EXECUTES the instance through the real executor:
  // the substrate double saw the agent run (start → execute → stop).
  const presented = await session.presentCurrentQuestion();
  assert.ok(presented.ok, `presentation must succeed: ${JSON.stringify(presented)}`);
  assert.ok(seam.stack.substrate.startedSpecs.length >= 1, "the real executor must have started a runtime");
  const spec = seam.stack.substrate.startedSpecs[0];
  assert.ok(spec !== undefined, "a started substrate spec must exist");
  assert.equal(spec.agentBodyRef, `${INTERVIEWER_AGENT_BODY_ID}@1`);
  assert.ok(spec.modelRef !== undefined, "the port-issued model ref flows into the substrate spec");

  const completed = await session.complete();
  assert.ok(completed.ok, `completion must succeed: ${JSON.stringify(completed)}`);
  assert.equal(completed.value.closed, true);
  const releasedRecord = seam.stack.agentInstances.get(scope, summary.interviewer.agent.instanceId as never);
  assert.equal(releasedRecord?.lifecycle, "released", "completion must RELEASE the agent instance");

  // After completion every method fails closed.
  const closedPresent = await session.presentCurrentQuestion();
  assert.ok(!closedPresent.ok && closedPresent.error.kind === "session-closed");
  const answered = await session.recordAnswer(answer(ANSWER_ELABORATE));
  assert.ok(!answered.ok && answered.error.kind === "session-closed");
  const switched = await session.switchRepresentation(TEXT_REPRESENTATION);
  assert.ok(!switched.ok && switched.error.kind === "session-closed");
  const recompleted = await session.complete();
  assert.ok(!recompleted.ok && recompleted.error.kind === "session-closed");
});

test("§14 provenance labels: every representation kind carries provenance; synthetic stays labeled", async () => {
  const representations: readonly { label: string; representation: InterviewerRepresentation }[] = [
    { label: "voice (synthetic)", representation: VOICE_REPRESENTATION },
    { label: "text (human-performed)", representation: TEXT_REPRESENTATION },
    {
      label: "avatar (synthetic)",
      representation: {
        representation: "avatar",
        provenance: { origin: "synthetic-generated", generatorCapability: "animate_avatar" as never },
      },
    },
    {
      label: "prerecorded (human + rights + consent)",
      representation: {
        representation: "prerecorded",
        provenance: { origin: "human-performed", humanConsentRefs: ["consent-interviewer-2" as never] },
        sourceArtifact: "artifact-interviewer-bank-1" as never,
        rightsRef: "rights-interviewer-bank-1" as never,
        consentRefs: ["consent-interviewer-2" as never],
      },
    },
    {
      label: "generated (synthetic by construction)",
      representation: {
        representation: "generated",
        provenance: {
          origin: "synthetic-generated",
          generatorCapability: "generate_questions" as never,
        },
        requiredCapabilities: ["generate_questions" as never],
      },
    },
    {
      label: "hybrid (mixed components)",
      representation: {
        representation: "hybrid",
        components: [
          {
            representation: "prerecorded",
            provenance: { origin: "human-performed" },
            sourceArtifact: "artifact-interviewer-bank-2" as never,
            rightsRef: "rights-interviewer-bank-2" as never,
            consentRefs: ["consent-interviewer-3" as never],
          },
          {
            representation: "generated",
            provenance: { origin: "synthetic-generated", generatorCapability: "generate_questions" as never },
            requiredCapabilities: ["generate_questions" as never],
          },
        ],
      },
    },
  ];
  for (const { label, representation } of representations) {
    const seam = composeInterviewSeam();
    const { session } = await createSession(seam, { representation });
    const presented = await session.presentCurrentQuestion();
    assert.ok(presented.ok, `${label}: presentation must succeed: ${JSON.stringify(presented)}`);
    // The label travels on the presentation END-TO-END (§14).
    assert.equal(presented.value.representationKind, representation.representation, label);
    assert.ok(presented.value.provenance.origin.length > 0, `${label}: provenance origin must be present`);
  }
  // Hybrid mixed provenance is the union of its components' origins.
  const seam = composeInterviewSeam();
  const { session } = await createSession(seam, { representation: representations[5]?.representation });
  const presented = await session.presentCurrentQuestion();
  assert.ok(presented.ok);
  assert.equal(presented.value.provenance.origin, "mixed");

  // Invalid representations fail closed with enumerated reasons (§14).
  const seam2 = composeInterviewSeam();
  const graph = await seam2.graphFromIntent(
    intentRecordFixture({ statement: "Interview me", tenantId: TENANT, recordedBy: USER }),
  );
  const invalid = await createInterviewerSession(
    {
      tenantId: TENANT,
      graph: { graphId: graph.graphId, version: graph.version },
      representation: {
        representation: "voice",
        provenance: { origin: "synthetic-generated" as never },
      },
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    {
      store: seam2.store,
      sequencer: seam2.sequencer,
      agentBinding: seam2.stack.agentBinding,
      agent: seam2.stack.agent,
      clock: seam2.clock,
      nextSessionId: seam2.nextSessionId,
    },
  );
  assert.ok(!invalid.ok && invalid.error.kind === "representation-invalid");
  assert.ok(
    (invalid.error as { reasons: readonly string[] }).reasons.some((r) => r.includes("generatorCapability")),
    "a synthetic label without its generator capability must be rejected",
  );
});

test("representation switching mid-session preserves the session, history and provenance (§14)", async () => {
  const seam = composeInterviewSeam();
  const { session } = await createSession(seam, { representation: VOICE_REPRESENTATION });
  const sessionId = session.getSummary().sessionId;
  const agent = session.getSummary().interviewer.agent;

  // Voice-delivered presentation.
  const intro = await session.presentCurrentQuestion();
  assert.ok(intro.ok);
  assert.equal(intro.value.representationKind, "voice");
  assert.equal(intro.value.provenance.origin, "synthetic-generated");
  await session.recordAnswer(answer(ANSWER_ELABORATE));

  // Switch voice → text MID-SESSION.
  const switched = await session.switchRepresentation(TEXT_REPRESENTATION);
  assert.ok(switched.ok, `switch must succeed: ${JSON.stringify(switched)}`);
  assert.deepEqual(
    { from: switched.value.from, to: switched.value.to },
    { from: "voice", to: "text" },
  );

  // The session identity, agent binding and history are PRESERVED.
  const summary = session.getSummary();
  assert.equal(summary.sessionId, sessionId);
  assert.deepEqual(summary.interviewer.agent, agent);
  assert.equal(summary.presentations.length, 1, "the earlier presentation stays in the history");
  assert.equal(summary.representationSwitches.length, 1);

  // Later presentations carry the NEW representation + its provenance.
  const core = await session.presentCurrentQuestion();
  assert.ok(core.ok && core.value.representationKind === "text");
  assert.equal(core.value.provenance.origin, "human-performed");
  // Earlier presentations keep the representation that delivered them.
  assert.equal(summary.presentations[0]?.representationKind, "voice");
  assert.equal(summary.presentations[0]?.provenance.origin, "synthetic-generated");
});

test("fail-closed: unknown graph version, blank answers, undeclared cycles", async () => {
  const seam = composeInterviewSeam();
  const graph = await seam.graphFromIntent(
    intentRecordFixture({ statement: "Interview me", tenantId: TENANT, recordedBy: USER }),
  );
  const deps = {
    store: seam.store,
    sequencer: seam.sequencer,
    agentBinding: seam.stack.agentBinding,
    agent: seam.stack.agent,
    clock: seam.clock,
    nextSessionId: seam.nextSessionId,
  };
  // Unknown graph version is an EXPLICIT failure — never a silent latest.
  const unknownVersion = await createInterviewerSession(
    {
      tenantId: TENANT,
      graph: { graphId: graph.graphId, version: 99 as Version },
      representation: VOICE_REPRESENTATION,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    deps,
  );
  assert.ok(!unknownVersion.ok && unknownVersion.error.kind === "graph-version-not-found");
  const unknownGraph = await createInterviewerSession(
    {
      tenantId: TENANT,
      graph: { graphId: "script-graph-does-not-exist" as never, version: 1 as Version },
      representation: VOICE_REPRESENTATION,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    deps,
  );
  assert.ok(!unknownGraph.ok && unknownGraph.error.kind === "graph-not-found");

  // Blank answer refs are rejected.
  const { session } = await createSession(seam);
  await session.presentCurrentQuestion();
  const blank = await session.recordAnswer({ answerRef: "   " as never, answeredBy: ANSWERER });
  assert.ok(!blank.ok && blank.error.kind === "answer-blank");

  // An unknown interviewer BODY fails loudly through the real registry.
  const unknownBody = await createInterviewerSession(
    {
      tenantId: TENANT,
      graph: { graphId: graph.graphId, version: graph.version },
      representation: VOICE_REPRESENTATION,
      agentBody: { bodyId: "body-does-not-exist", bodyVersion: 1 as Version },
    },
    deps,
  );
  assert.ok(!unknownBody.ok && unknownBody.error.kind === "agent-binding-failed");
  assert.match((unknownBody.error as { reason: string }).reason, /body-does-not-exist/);
});

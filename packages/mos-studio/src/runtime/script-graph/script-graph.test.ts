import assert from "node:assert/strict";
import { test } from "node:test";

import { createScriptGraphStore, validateScriptGraphDraft } from "./script-graph-store.js";
import { createAdaptiveSequencer } from "./adaptive-sequencer.js";
import {
  ANSWER_CONCLUDE,
  ANSWER_ELABORATE,
  createInMemoryScriptGraphGenerator,
  intentRecordFixture,
} from "../../testing/in-memory-script-graph-generator.js";
import { createInMemoryInterviewerAgent } from "../../testing/in-memory-interviewer-agent.js";
import type { IntentRecord, ScriptGraphDraft } from "../../contracts/script-graph.js";
import type { IdentityRef, StudioFormatId, TenantId, Timestamp, Version } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-003: intent → versioned script/question graph with provenance (§14);
// adaptive branch selection; graph version immutability; interviewer agent
// port (disclosed double — future AGT-002 binding documented at the port).
// ---------------------------------------------------------------------------

const TENANT = "tenant-001" as TenantId;
const USER = "identity-user-1" as IdentityRef;
const FORMAT = "audio-podcast" as StudioFormatId;

const deterministicClock = (baseEpochMs = Date.UTC(2026, 0, 6, 9, 0, 0)): (() => Timestamp) => {
  let tick = 0;
  return () => new Date(baseEpochMs + (tick++) * 1000).toISOString() as Timestamp;
};

/** Compose the STUDIO-003 seam: generator double + REAL store + REAL sequencer. */
function composeScriptGraphSeam() {
  const clock = deterministicClock();
  const store = createScriptGraphStore({ clock });
  const generator = createInMemoryScriptGraphGenerator();
  const sequencer = createAdaptiveSequencer({ store });
  const interviewerAgent = createInMemoryInterviewerAgent({ clock });
  return { clock, store, generator, sequencer, interviewerAgent };
}

/** Generate + register a graph from an intent (the composed §14 flow). */
async function generateAndRegister(
  seam: ReturnType<typeof composeScriptGraphSeam>,
  intent: IntentRecord,
  formatId: StudioFormatId = FORMAT,
) {
  const generated = await seam.generator.generateScriptGraph({ intent, formatId });
  assert.ok(generated.ok, `generation must succeed: ${JSON.stringify(generated)}`);
  const registered = seam.store.register(generated.draft);
  assert.ok(registered.ok, `registration must succeed: ${JSON.stringify(registered)}`);
  return { generated, registered };
}

test("intent → versioned script/question graph with synthetic/generated provenance (§14)", async () => {
  const seam = composeScriptGraphSeam();
  const intent = intentRecordFixture({
    statement: "Produce an audio podcast about coastal sailing weather lore",
    tenantId: TENANT,
    recordedBy: USER,
  });

  const { registered } = await generateAndRegister(seam, intent);

  // VERSIONED: the store assigned version 1 of a new graph id.
  const graph = registered.value.graph;
  assert.equal(graph.version, 1);
  assert.ok(String(graph.graphId).length > 0);
  assert.equal(registered.value.versions.length, 1);
  assert.equal(seam.store.resolve({ graphId: graph.graphId, version: 1 as Version }), graph);

  // PROVENANCE (§14): intent-only generation is labeled synthetic/generated
  // at the graph level AND on every generated node, naming the intent.
  assert.equal(graph.provenance.origin, "synthetic-generated");
  assert.equal(graph.provenance.generatedFromIntent, intent.intentId);
  assert.equal(graph.intentId, intent.intentId);
  assert.ok(graph.nodes.length >= 3);
  for (const node of graph.nodes) {
    assert.equal(node.provenance.origin, "synthetic-generated", `node ${node.nodeId} must be labeled`);
    assert.equal(node.provenance.generatedFromIntent, intent.intentId);
  }

  // Structure: question/prompt/beat nodes with declared branch edges.
  const kinds = new Set(graph.nodes.map((node) => node.kind));
  assert.ok(kinds.has("question") && kinds.has("prompt") && kinds.has("beat"));
  assert.ok(graph.branchEdges.length >= 2);
  assert.equal(graph.entryNodeId, "opening");
});

test("generator double fails explicitly: blank intent statement, unsupported format", async () => {
  const seam = composeScriptGraphSeam();
  const blank = await seam.generator.generateScriptGraph({
    intent: intentRecordFixture({ statement: "   ", tenantId: TENANT, recordedBy: USER }),
  });
  assert.ok(!blank.ok && blank.error.kind === "intent-statement-blank");

  // The reaction format has no question/branch graph contract (§16) — the
  // generator refuses instead of silently producing one.
  const reaction = await seam.generator.generateScriptGraph({
    intent: intentRecordFixture({ statement: "React to the trailer", tenantId: TENANT, recordedBy: USER }),
    formatId: "reaction" as StudioFormatId,
  });
  assert.ok(!reaction.ok && reaction.error.kind === "format-unsupported-for-question-graphs");
});

test("adaptive selection: answer A → question X; answer B → question Y (declared branches)", async () => {
  const seam = composeScriptGraphSeam();
  const intent = intentRecordFixture({
    statement: "Interview me about learning to sail",
    tenantId: TENANT,
    recordedBy: USER,
  });
  const { registered } = await generateAndRegister(seam, intent);
  const { graphId, version } = { graphId: registered.value.graph.graphId, version: registered.value.graph.version };

  // Walk: entry beat → prompt (declared default fallbacks, no answer needed).
  const toIntro = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "opening", answerRef: "answer-none" as never,
  });
  assert.ok(toIntro.ok && toIntro.nextNodeId === "intro");
  const toCore = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "intro", answerRef: "answer-none" as never,
  });
  assert.ok(toCore.ok && toCore.nextNodeId === "core");

  // THE branch behavior: answer elaborate → deepen; answer conclude → wrap.
  const elaborate = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "core", answerRef: ANSWER_ELABORATE,
  });
  assert.ok(elaborate.ok && elaborate.nextNodeId === "deepen", `elaborate → deepen: ${JSON.stringify(elaborate)}`);
  const conclude = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "core", answerRef: ANSWER_CONCLUDE,
  });
  assert.ok(conclude.ok && conclude.nextNodeId === "wrap", `conclude → wrap: ${JSON.stringify(conclude)}`);

  // From deepen, concluding wraps; an unmatched answer with no declared
  // fallback ends the path deterministically (null — never a guess).
  const deepThenWrap = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "deepen", answerRef: ANSWER_CONCLUDE,
  });
  assert.ok(deepThenWrap.ok && deepThenWrap.nextNodeId === "wrap");
  const end = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "deepen", answerRef: "answer-unknown" as never,
  });
  assert.ok(end.ok && end.nextNodeId === null);

  // Determinism: same inputs, same answer, again.
  const repeat = await seam.sequencer.selectNextNode({
    graphId, version, currentNodeId: "core", answerRef: ANSWER_ELABORATE,
  });
  assert.ok(repeat.ok && repeat.nextNodeId === "deepen");
});

test("adaptive selection resolves the EXACT graph version — never a silent latest fallback", async () => {
  const seam = composeScriptGraphSeam();
  const intent = intentRecordFixture({ statement: "Interview me", tenantId: TENANT, recordedBy: USER });
  const { registered } = await generateAndRegister(seam, intent);
  const graphId = registered.value.graph.graphId;

  const unknownVersion = await seam.sequencer.selectNextNode({
    graphId, version: 99 as Version, currentNodeId: "core", answerRef: ANSWER_ELABORATE,
  });
  assert.ok(!unknownVersion.ok && unknownVersion.error.kind === "graph-version-not-found");

  const unknownGraph = await seam.sequencer.selectNextNode({
    graphId: "script-graph-ghost" as never, version: 1 as Version, currentNodeId: "core", answerRef: ANSWER_ELABORATE,
  });
  assert.ok(!unknownGraph.ok && unknownGraph.error.kind === "graph-not-found");

  const unknownNode = await seam.sequencer.selectNextNode({
    graphId, version: 1 as Version, currentNodeId: "ghost-node", answerRef: ANSWER_ELABORATE,
  });
  assert.ok(!unknownNode.ok && unknownNode.error.kind === "node-not-in-graph");
});

test("graph immutability: a revision creates a NEW version; the old version stays resolvable and unchanged", async () => {
  const seam = composeScriptGraphSeam();
  const intent = intentRecordFixture({ statement: "Interview me about tides", tenantId: TENANT, recordedBy: USER });
  const { registered } = await generateAndRegister(seam, intent);
  const graphId = registered.value.graph.graphId;
  const v1 = seam.store.resolve({ graphId, version: 1 as Version });
  assert.ok(v1 !== null);
  const v1Snapshot = JSON.parse(JSON.stringify(v1)) as unknown;

  // Revise: a human author tightens the core question and drops the prompt —
  // the revision is human-authored material, so its nodes carry that label.
  const revisedDraft: ScriptGraphDraft = {
    intentId: intent.intentId,
    provenance: { origin: "mixed" },
    entryNodeId: "core",
    nodes: [
      {
        nodeId: "core",
        kind: "question",
        text: "What do the tides decide for you?",
        provenance: { origin: "human-authored" },
      },
      {
        nodeId: "wrap",
        kind: "beat",
        description: "Close the segment",
        provenance: { origin: "human-authored" },
      },
    ],
    branchEdges: [
      { edgeId: "edge-core-conclude", fromNodeId: "core", answerRef: ANSWER_CONCLUDE, toNodeId: "wrap" },
    ],
  };
  const revised = seam.store.addVersion(graphId, revisedDraft);
  assert.ok(revised.ok, `revision must register: ${JSON.stringify(revised)}`);
  assert.equal(revised.value.graph.version, 2);
  assert.deepEqual(revised.value.versions, [1, 2]);
  assert.equal(seam.store.latest(graphId)?.ref.version, 2);

  // The OLD version is still resolvable and bit-for-bit unchanged.
  const v1After = seam.store.resolve({ graphId, version: 1 as Version });
  assert.ok(v1After !== null);
  assert.deepEqual(JSON.parse(JSON.stringify(v1After)) as unknown, v1Snapshot);
  assert.equal(v1After.nodes.length, 5);
  assert.equal(v1After.entryNodeId, "opening");

  // The NEW version is the revised shape (and versioning is monotonic).
  const v2 = seam.store.resolve({ graphId, version: 2 as Version });
  assert.ok(v2 !== null);
  assert.equal(v2.nodes.length, 2);
  const firstNode = v2.nodes[0];
  assert.ok(firstNode !== undefined && firstNode.kind === "question" && firstNode.text === "What do the tides decide for you?");
  assert.equal(v2.provenance.origin, "mixed");
  // Human-authored nodes are labeled as such — provenance discrimination works.
  assert.ok(firstNode !== undefined && firstNode.kind === "question" && firstNode.provenance.origin === "human-authored");
});

test("stored graphs are runtime-immutable (frozen deep)", async () => {
  const seam = composeScriptGraphSeam();
  const intent = intentRecordFixture({ statement: "Interview me about anchors", tenantId: TENANT, recordedBy: USER });
  const { registered } = await generateAndRegister(seam, intent);
  const graph = registered.value.graph;
  assert.throws(() => {
    (graph as unknown as { entryNodeId: string }).entryNodeId = "hijack";
  }, TypeError);
  assert.throws(() => {
    (graph.nodes[0] as unknown as { nodeId: string }).nodeId = "hijack";
  }, TypeError);
});

test("store validation fails loudly with explicit reasons (never a silent fix-up)", () => {
  const reasons = validateScriptGraphDraft({
    intentId: "intent-x" as never,
    provenance: { origin: "synthetic-generated", generatedFromIntent: "intent-x" as never },
    entryNodeId: "missing-entry",
    nodes: [
      { nodeId: "n1", kind: "question", text: "q", provenance: { origin: "synthetic-generated" } },
    ],
    branchEdges: [
      { edgeId: "e1", fromNodeId: "n1", answerRef: "a1" as never, toNodeId: "ghost" },
    ],
  });
  assert.ok(reasons.some((r) => r.includes("entry node not in graph")));
  assert.ok(reasons.some((r) => r.includes("unknown node")));
  assert.ok(reasons.some((r) => r.includes("does not name its generating intent")));
});

test("interviewer agent (disclosed double, future AGT-002 binding) carries provenance forward unchanged", async () => {
  const seam = composeScriptGraphSeam();
  const intent = intentRecordFixture({ statement: "Interview me about lighthouses", tenantId: TENANT, recordedBy: USER });
  const { registered } = await generateAndRegister(seam, intent);
  const graph = registered.value.graph;

  // The composed §14 interview step: present the selected question through a
  // generated interviewer representation — synthetic labeling survives.
  const presented = await seam.interviewerAgent.presentQuestion({
    tenantId: TENANT,
    graph: { graphId: graph.graphId, version: graph.version },
    question: { nodeId: "core", text: "What matters most about lighthouses?" },
    representation: {
      representation: "voice",
      provenance: { origin: "synthetic-generated", generatorCapability: "generate_voice" as never },
    },
  });
  assert.ok(presented.ok, `presentation must succeed: ${JSON.stringify(presented)}`);
  assert.equal(presented.presentation.questionNodeId, "core");
  assert.equal(presented.presentation.representationKind, "voice");
  assert.equal(presented.presentation.provenance.origin, "synthetic-generated");

  // A blank question is an explicit failure — the double never invents one.
  const blank = await seam.interviewerAgent.presentQuestion({
    tenantId: TENANT,
    graph: { graphId: graph.graphId, version: graph.version },
    question: { nodeId: "core", text: "   " },
    representation: {
      representation: "text",
      provenance: { origin: "human-performed" },
    },
  });
  assert.ok(!blank.ok && blank.error.kind === "question-blank");
});

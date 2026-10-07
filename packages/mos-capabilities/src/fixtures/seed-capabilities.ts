/**
 * SEED CAPABILITY CATALOG (CAP-001 test fixtures).
 *
 * ⚠ SEED/EXAMPLE DATA — NOT ENGINE CLAIMS ⚠
 *
 * These are registered instances of the capability ids listed as EXAMPLES
 * in spec/mos-architecture-v2.0.md §5 ("Core abstractions → Capability"):
 * transcribe_audio, transcribe_video, detect_scenes, diarize_speakers,
 * rank_clip_candidates, segment_person, semantic_video_relevance,
 * generate_questions, generate_voice, animate_avatar, compose_reaction,
 * render_timeline, realtime_room, generate_video, evaluate_content.
 *
 * They are minimal, obviously-placeholder capability CONTRACT records
 * (minimal schemas, indicative cost/latency models, seed provenance
 * markers) used to exercise and demonstrate the registry in tests. They
 * make NO claim about any engine, model, license or benchmark: engines are
 * registered in @mos/engines against their own manifests and evidence
 * chains, never through this catalog. Real production capability records
 * arrive through the capability governance flow.
 */

import type { Capability, CapabilityId, Version } from "@mos/contracts";

/** Marker prefix on every seed record's provenance reference. */
export const SEED_PROVENANCE_MARKER = "provenance:seed-catalog";

const SEED_VERSION = 1 as Version;

function seedCapability(
  name: string,
  inputSchema: Readonly<Record<string, unknown>>,
  outputSchema: Readonly<Record<string, unknown>>,
  cost: { basis: Capability["costModel"]["basis"]; amount: number },
  latency: { p50Ms: number; p95Ms: number; p99Ms: number },
): Capability {
  return Object.freeze({
    id: name as CapabilityId,
    version: SEED_VERSION,
    inputSchema: Object.freeze({ ...inputSchema }),
    outputSchema: Object.freeze({ ...outputSchema }),
    evaluator: `evaluator:seed:${name}@${SEED_VERSION}` as Capability["evaluator"],
    costModel: Object.freeze({ ...cost, currency: "USD" }),
    latencyModel: Object.freeze({ ...latency }),
    provenance: `${SEED_PROVENANCE_MARKER}:${name}@${SEED_VERSION}` as Capability["provenance"],
  });
}

/**
 * The architecture §5 example capability ids as minimal registered seed
 * instances. Frozen; registering them into a registry copies nothing —
 * records are immutable — so the catalog can be reused across registries.
 */
export const SEED_CAPABILITY_CATALOG: readonly Capability[] = Object.freeze([
  seedCapability(
    "transcribe_audio",
    { type: "object", properties: { audio: { type: "string" } }, required: ["audio"] },
    { type: "object", properties: { transcript: { type: "string" } }, required: ["transcript"] },
    { basis: "per-minute", amount: 0.006 },
    { p50Ms: 2000, p95Ms: 5000, p99Ms: 9000 },
  ),
  seedCapability(
    "transcribe_video",
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { type: "object", properties: { transcript: { type: "string" } }, required: ["transcript"] },
    { basis: "per-minute", amount: 0.009 },
    { p50Ms: 4000, p95Ms: 9000, p99Ms: 15000 },
  ),
  seedCapability(
    "detect_scenes",
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { type: "object", properties: { scenes: { type: "array" } }, required: ["scenes"] },
    { basis: "per-minute", amount: 0.002 },
    { p50Ms: 1500, p95Ms: 3000, p99Ms: 5000 },
  ),
  seedCapability(
    "diarize_speakers",
    { type: "object", properties: { audio: { type: "string" } }, required: ["audio"] },
    { type: "object", properties: { speakers: { type: "array" } }, required: ["speakers"] },
    { basis: "per-minute", amount: 0.004 },
    { p50Ms: 2500, p95Ms: 6000, p99Ms: 11000 },
  ),
  seedCapability(
    "rank_clip_candidates",
    { type: "object", properties: { candidates: { type: "array" } }, required: ["candidates"] },
    { type: "object", properties: { ranked: { type: "array" } }, required: ["ranked"] },
    { basis: "per-invocation", amount: 0.001 },
    { p50Ms: 300, p95Ms: 800, p99Ms: 1500 },
  ),
  seedCapability(
    "segment_person",
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { type: "object", properties: { masks: { type: "array" } }, required: ["masks"] },
    { basis: "per-second", amount: 0.003 },
    { p50Ms: 5000, p95Ms: 12000, p99Ms: 20000 },
  ),
  seedCapability(
    "semantic_video_relevance",
    { type: "object", properties: { video: { type: "string" }, query: { type: "string" } }, required: ["video", "query"] },
    { type: "object", properties: { relevance: { type: "number" } }, required: ["relevance"] },
    { basis: "per-invocation", amount: 0.0005 },
    { p50Ms: 400, p95Ms: 1200, p99Ms: 2500 },
  ),
  seedCapability(
    "generate_questions",
    { type: "object", properties: { context: { type: "string" } }, required: ["context"] },
    { type: "object", properties: { questions: { type: "array" } }, required: ["questions"] },
    { basis: "per-invocation", amount: 0.002 },
    { p50Ms: 1000, p95Ms: 3000, p99Ms: 6000 },
  ),
  seedCapability(
    "generate_voice",
    { type: "object", properties: { script: { type: "string" } }, required: ["script"] },
    { type: "object", properties: { audio: { type: "string" } }, required: ["audio"] },
    { basis: "per-second", amount: 0.01 },
    { p50Ms: 3000, p95Ms: 8000, p99Ms: 14000 },
  ),
  seedCapability(
    "animate_avatar",
    { type: "object", properties: { script: { type: "string" }, avatar: { type: "string" } }, required: ["script", "avatar"] },
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { basis: "per-second", amount: 0.05 },
    { p50Ms: 15000, p95Ms: 40000, p99Ms: 90000 },
  ),
  seedCapability(
    "compose_reaction",
    { type: "object", properties: { source: { type: "string" }, reaction: { type: "string" } }, required: ["source", "reaction"] },
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { basis: "per-invocation", amount: 0.008 },
    { p50Ms: 8000, p95Ms: 20000, p99Ms: 35000 },
  ),
  seedCapability(
    "render_timeline",
    { type: "object", properties: { timeline: { type: "object" } }, required: ["timeline"] },
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { basis: "per-second", amount: 0.001 },
    { p50Ms: 6000, p95Ms: 15000, p99Ms: 30000 },
  ),
  seedCapability(
    "realtime_room",
    { type: "object", properties: { participants: { type: "array" } }, required: ["participants"] },
    { type: "object", properties: { session: { type: "string" } }, required: ["session"] },
    { basis: "per-tenant-hour", amount: 0.12 },
    { p50Ms: 100, p95Ms: 250, p99Ms: 500 },
  ),
  seedCapability(
    "generate_video",
    { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
    { type: "object", properties: { video: { type: "string" } }, required: ["video"] },
    { basis: "per-second", amount: 0.4 },
    { p50Ms: 60000, p95Ms: 180000, p99Ms: 300000 },
  ),
  seedCapability(
    "evaluate_content",
    { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    { type: "object", properties: { verdict: { type: "string" } }, required: ["verdict"] },
    { basis: "per-invocation", amount: 0.0008 },
    { p50Ms: 500, p95Ms: 1500, p99Ms: 3000 },
  ),
]);

/** The §5 example capability ids, in spec order. */
export const SEED_CAPABILITY_IDS: readonly CapabilityId[] = Object.freeze(
  SEED_CAPABILITY_CATALOG.map((capability) => capability.id),
);

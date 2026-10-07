/**
 * Artifact package assembly for the Studio runtime (STUDIO-001).
 *
 * Assembles `StudioArtifactPackage` versions from session state. Required
 * fields match spec/contracts/core-contracts-v2.0.yaml exactly. Package
 * versions are an append-only immutable chain under one package id: version
 * 1 is assembled when a review accepts the draft; every treatment creates a
 * NEW version that supersedes nothing — all earlier versions stay resolvable
 * (§19, historical reproducibility).
 *
 * Raw human captures enter the package as `rawArtifacts` AND, once processed
 * by the organization, as lineage parents of `intermediateArtifacts` — the
 * raw stage is never silently promoted to final (§6, §16).
 */

import type {
  ConsentRef,
  ConversationGraphId,
  EditGraphId,
  MoneyAmount,
  StudioArtifactPackageId,
  Timestamp,
} from "../contracts/refs.js";
import type {
  StudioArtifactPackage,
  StudioArtifactPackageEvaluation,
  StudioArtifactRef,
} from "../contracts/studio-artifact-package.js";
import type { StudioSessionRecord } from "./session-state.js";

/** Sum a list of same-currency decimal-string amounts without float drift. */
function sumMoneyAmounts(lines: readonly MoneyAmount[]): MoneyAmount {
  if (lines.length === 0) {
    return { currency: "USD", amount: "0.00" };
  }
  const currency = lines[0]?.currency ?? "USD";
  // Work in integer minor units at the maximum decimal scale seen.
  let maxScale = 2;
  const normalized: { units: bigint; scale: number }[] = lines.map((line) => {
    const [whole = "0", frac = ""] = line.amount.split(".");
    const scale = frac.length;
    if (scale > maxScale) {
      maxScale = scale;
    }
    return { units: BigInt(`${whole}${frac}`.length === 0 ? "0" : `${whole}${frac}`), scale };
  });
  let total = 0n;
  for (const entry of normalized) {
    const upscale = 10n ** BigInt(maxScale - entry.scale);
    total += entry.units * upscale;
  }
  const divisor = 10n ** BigInt(maxScale);
  const whole = total / divisor;
  const frac = (total % divisor).toString().padStart(maxScale, "0");
  return { currency, amount: `${whole.toString()}.${frac}` };
}

function elapsedSeconds(from: Timestamp, to: Timestamp): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
}

/**
 * Assemble the next package version from the session record.
 * `evaluation` describes the review state that motivated this version
 * (accepted first version, treatment-created successor version, ...).
 */
export function assembleArtifactPackage(
  record: StudioSessionRecord,
  packageId: StudioArtifactPackageId,
  at: Timestamp,
  evaluation: Pick<StudioArtifactPackageEvaluation, "outcome"> & {
    status?: StudioArtifactPackageEvaluation["status"];
    evaluationRef?: string;
  },
): StudioArtifactPackage {
  const { draft } = record;
  const allArtifacts: readonly StudioArtifactRef[] = [
    ...draft.rawArtifacts,
    ...draft.intermediateArtifacts,
    ...draft.finalArtifacts,
  ];
  const provenanceRefs = [...new Set(allArtifacts.map((a) => a.provenanceRef))];
  const participantConsentRefs = [
    ...new Set(
      [...record.participants.values()].flatMap((p) => [...p.consent.consentRefs]),
    ),
  ] satisfies ConsentRef[];
  const lineageComplete = [...draft.intermediateArtifacts, ...draft.finalArtifacts].every(
    (a) => a.parentArtifactRefs.length > 0,
  );
  const containsSyntheticMaterial = allArtifacts.some((a) => a.creationMethod === "engine-generated");
  const allRawArtifactsCovered = draft.rawArtifacts.every(
    (a) => (draft.rawArtifactConsent.get(a.artifactId)?.length ?? 0) > 0,
  );
  return Object.freeze({
    id: packageId,
    version: record.packages.length + 1,
    sessionRef: record.sessionId,
    rawArtifacts: Object.freeze([...draft.rawArtifacts]),
    intermediateArtifacts: Object.freeze([...draft.intermediateArtifacts]),
    finalArtifacts: Object.freeze([...draft.finalArtifacts]),
    transcriptRefs: Object.freeze([...draft.transcriptRefs]),
    conversationGraphRef: Object.freeze(
      draft.conversationGraphRef ?? {
        graphId: `mos-studio:conversation-graph:${record.sessionId}` as ConversationGraphId,
        version: record.packages.length + 1,
        derivedFrom: Object.freeze([...draft.transcriptRefs]),
      },
    ),
    editGraphRef: Object.freeze(
      draft.editGraphRef ?? {
        graphId: `mos-studio:edit-graph:${record.sessionId}` as EditGraphId,
        version: record.packages.length + 1,
        otioInterchange: false,
      },
    ),
    provenance: Object.freeze({
      provenanceRefs: Object.freeze(provenanceRefs),
      lineageComplete,
      containsSyntheticMaterial,
    }),
    consent: Object.freeze({
      participantConsentRefs: Object.freeze(participantConsentRefs),
      allRawArtifactsCovered,
    }),
    evaluation: Object.freeze({
      status: evaluation.status ?? "pending",
      outcome: evaluation.outcome,
      evaluationRef: evaluation.evaluationRef,
    }),
    cost: Object.freeze({ total: sumMoneyAmounts(draft.costLines) }),
    duration: Object.freeze({
      captureSeconds: draft.captureSeconds,
      processingSeconds: draft.processingSeconds,
      totalWallClockSeconds: elapsedSeconds(record.createdAt, at),
    }),
    createdAt: at,
  });
}

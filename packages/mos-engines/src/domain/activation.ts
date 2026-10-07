/**
 * Engine activation evidence chain (ENG-001).
 *
 * Encodes spec/mos-engine-policy-v2.0.yaml `activation.required` exactly:
 *   manifestValidation, capabilityContractTests, goldenCorpusBenchmark,
 *   evaluatorResult, securitySandboxReview, codeLicenseReview,
 *   modelLicenseReview, sourceDataRightsReview, provenanceRecord.
 *
 * The activation gate is FAIL-CLOSED: an engine version cannot activate
 * without the full evidence chain (missing items are rejected BY NAME),
 * without concluding verdicts (cleared / passed / compatible), and without
 * a policy-legal sandbox posture (the policy's forbidden list: no provider
 * credentials inside engines, no unsandboxed execution, no unreviewed
 * model weights).
 *
 * `ACTIVATION_EVIDENCE_KEYS` is the machine-readable key list, in policy
 * order.
 */

import type {
  BenchmarkResult,
  CapabilityId,
  ContentDigest,
  EngineBenchmarkId,
  EngineId,
  EvaluatorRef,
  LicenseReviewStatus,
  ProvenanceRef,
  Timestamp,
  Version,
} from "@mos/contracts";

import type { CompatibilityVerdict } from "./resolution.js";

/** The nine required evidence items, in spec/mos-engine-policy-v2.0.yaml order. */
export const ACTIVATION_EVIDENCE_KEYS = [
  "manifestValidation",
  "capabilityContractTests",
  "goldenCorpusBenchmark",
  "evaluatorResult",
  "securitySandboxReview",
  "codeLicenseReview",
  "modelLicenseReview",
  "sourceDataRightsReview",
  "provenanceRecord",
] as const;

export type ActivationEvidenceKey = (typeof ACTIVATION_EVIDENCE_KEYS)[number];

/** Manifest validation evidence: when the manifest was validated and its digest. */
export interface ManifestValidationEvidence {
  readonly validatedAt: Timestamp;
  readonly manifestDigest: ContentDigest;
}

/**
 * Capability contract test evidence for one declared capability: the
 * verdict of running the engine against the capability's contract tests.
 * `verdict: "incompatible"` blocks activation for that capability
 * (fail-closed: an engine is activated only for capabilities it actually
 * satisfies).
 */
export interface CapabilityContractTestEvidence {
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly verdict: CompatibilityVerdict;
  readonly testReportRef: string;
}

/** Golden-corpus benchmark evidence: which benchmark record, and its result. */
export interface GoldenCorpusBenchmarkEvidence {
  readonly benchmarkId: EngineBenchmarkId;
  readonly result: BenchmarkResult;
}

/** Evaluator result evidence: the quality evaluator's verdict. */
export interface EvaluatorResultEvidence {
  readonly evaluator: EvaluatorRef;
  readonly verdict: "pass" | "fail";
  readonly reportRef: string;
}

/** Security/sandbox review evidence. */
export interface SecuritySandboxReviewEvidence {
  readonly reviewedAt: Timestamp;
  readonly reviewer: string;
  readonly verdict: "pass" | "fail";
  readonly sandboxReportRef: string;
}

/** One license review (code, model/checkpoint, or source-data layer — spec §29). */
export interface LicenseReviewEvidence {
  readonly reviewedAt: Timestamp;
  readonly reviewer: string;
  readonly verdict: LicenseReviewStatus;
  readonly reportRef: string;
}

/** Provenance record evidence for the engine. */
export interface ProvenanceRecordEvidence {
  readonly provenanceRef: ProvenanceRef;
  readonly recordedAt: Timestamp;
}

/** The complete activation evidence chain (all nine items). */
export interface EngineActivationEvidence {
  readonly manifestValidation: ManifestValidationEvidence;
  readonly capabilityContractTests: readonly CapabilityContractTestEvidence[];
  readonly goldenCorpusBenchmark: GoldenCorpusBenchmarkEvidence;
  readonly evaluatorResult: EvaluatorResultEvidence;
  readonly securitySandboxReview: SecuritySandboxReviewEvidence;
  readonly codeLicenseReview: LicenseReviewEvidence;
  readonly modelLicenseReview: LicenseReviewEvidence;
  readonly sourceDataRightsReview: LicenseReviewEvidence;
  readonly provenanceRecord: ProvenanceRecordEvidence;
}

/**
 * Input accepted by the activation gate: any subset of the chain. Missing
 * keys are the named missing items in a rejected activation.
 */
export type EngineActivationEvidenceInput = {
  readonly [K in ActivationEvidenceKey]?: EngineActivationEvidence[K];
};

/** Outcome of an activation attempt: activated, or rejected with named reasons. */
export type EngineActivationResult =
  | {
      readonly activated: true;
      readonly engineId: EngineId;
      readonly engineVersion: Version;
      readonly activatedAt: Timestamp;
    }
  | {
      readonly activated: false;
      readonly engineId: EngineId;
      readonly engineVersion: Version;
      /** Named missing evidence items (subset of ACTIVATION_EVIDENCE_KEYS). */
      readonly missingEvidence: readonly ActivationEvidenceKey[];
      /** Named failed checks (verdict/policy violations), e.g. "codeLicenseReview:not-cleared". */
      readonly failedChecks: readonly string[];
    };

/**
 * Computes the named missing evidence items for a (possibly partial)
 * evidence submission.
 */
export function missingEvidenceItems(
  evidence: EngineActivationEvidenceInput,
): readonly ActivationEvidenceKey[] {
  return ACTIVATION_EVIDENCE_KEYS.filter(
    (key) => evidence[key] === undefined,
  );
}

/**
 * Validates a FULL evidence chain beyond presence: verdicts must conclude
 * (licenses cleared, evaluator pass, benchmark passed, sandbox pass) and
 * the declared capability ids must all be covered by contract tests with
 * non-incompatible verdicts. Returns the named failed checks; empty means
 * the chain is activation-grade.
 */
export function activationFailedChecks(
  evidence: EngineActivationEvidence,
  declaredCapabilityIds: readonly CapabilityId[],
): readonly string[] {
  const failed: string[] = [];

  if (evidence.evaluatorResult.verdict !== "pass") {
    failed.push("evaluatorResult:not-passed");
  }
  if (evidence.goldenCorpusBenchmark.result !== "passed") {
    failed.push("goldenCorpusBenchmark:not-passed");
  }
  if (evidence.securitySandboxReview.verdict !== "pass") {
    failed.push("securitySandboxReview:not-passed");
  }
  if (evidence.codeLicenseReview.verdict !== "cleared") {
    failed.push("codeLicenseReview:not-cleared");
  }
  if (evidence.modelLicenseReview.verdict !== "cleared") {
    failed.push("modelLicenseReview:not-cleared");
  }
  if (evidence.sourceDataRightsReview.verdict !== "cleared") {
    failed.push("sourceDataRightsReview:not-cleared");
  }

  const tested = new Map<string, CapabilityContractTestEvidence>();
  for (const test of evidence.capabilityContractTests) {
    tested.set(test.capabilityId as string, test);
  }
  for (const capabilityId of declaredCapabilityIds) {
    const test = tested.get(capabilityId as string);
    if (test === undefined) {
      failed.push(
        `capabilityContractTests:missing:${capabilityId as string}`,
      );
    } else if (test.verdict === "incompatible") {
      failed.push(
        `capabilityContractTests:incompatible:${capabilityId as string}`,
      );
    }
  }

  return failed;
}

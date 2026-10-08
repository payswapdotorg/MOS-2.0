/**
 * DISCLOSED in-memory doubles of the BRIDGE-001 authority gate ports —
 * deterministic, self-labeling test seams for the in-package bridge battery.
 *
 * These are DOUBLES, never authorities: the REAL `@mos/missions`,
 * `@mos/policy` and `@mos/rights` authorities are wired behind the same ports
 * at the testing composition seam (src/testing/real-bridge-authorities.ts +
 * compat/bridge-real-authorities.test.ts). Every double records the requests
 * it received so tests can assert the EXACT frames the bridge emitted (gate
 * ordering, §30 context, derivation correctness).
 */

import type { LabToStudioRightsFrameResolution, LabToStudioRightsSubjectVerdict } from "../contracts/lab-to-studio-entry.js";
import type {
  BridgeMissionPort,
  BridgeMissionSnapshot,
  ProductionEntryPolicyCheckRequest,
  ProductionEntryPolicyGatePort,
  ProductionEntryPolicyVerdict,
  ProductionEntryCoverageRequest,
  ProductionEntryCoverageVerdict,
  ProductionEntryRightsFrameRequest,
  ProductionEntryRightsFrameVerdict,
  ProductionEntryRightsGatePort,
} from "../contracts/bridge-authority-ports.js";

// ---------------------------------------------------------------------------
// The mission double
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryBridgeMissionPort}. */
export interface InMemoryBridgeMissionPortOptions {
  /** The resolvable missions (tenant-scoped by the snapshot's own tenantId). */
  readonly missions: readonly BridgeMissionSnapshot[];
}

/** Create the disclosed mission-authority double (call log for assertions). */
export function createInMemoryBridgeMissionPort(
  options: InMemoryBridgeMissionPortOptions,
): BridgeMissionPort & {
  /** Test inspection: every (scope, ref, version) lookup, in order. */
  readonly requestedLookups: readonly {
    readonly tenantId: string;
    readonly missionRef: string;
    readonly version: number;
  }[];
} {
  const requestedLookups: { tenantId: string; missionRef: string; version: number }[] = [];
  return {
    getMission(scope, missionRef, version) {
      requestedLookups.push({
        tenantId: String(scope.tenantId),
        missionRef: String(missionRef),
        version,
      });
      const mission = options.missions.find(
        (candidate) =>
          String(candidate.id) === String(missionRef) &&
          candidate.version === version &&
          // §31: cross-tenant ≡ unknown — no existence leaks.
          String(candidate.tenantId) === String(scope.tenantId),
      );
      return mission ?? null;
    },
    requestedLookups,
  };
}

// ---------------------------------------------------------------------------
// The policy gate double (scriptable, fail-closed default)
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryProductionEntryPolicyGatePort}. */
export interface InMemoryProductionEntryPolicyGatePortOptions {
  /**
   * The scripted verdicts, consumed in order; the LAST script entry repeats.
   * Defaults to a fail-closed `insufficient-policy` denial — a double with no
   * script never permits (the W6-C no-permissive-default discipline).
   */
  readonly script?: readonly ProductionEntryPolicyVerdict[];
}

/** Create the disclosed policy-gate double (call log for assertions). */
export function createInMemoryProductionEntryPolicyGatePort(
  options: InMemoryProductionEntryPolicyGatePortOptions = {},
): ProductionEntryPolicyGatePort & {
  /** Test inspection: every check request the bridge emitted, in order. */
  readonly receivedRequests: readonly ProductionEntryPolicyCheckRequest[];
} {
  const receivedRequests: ProductionEntryPolicyCheckRequest[] = [];
  const script = options.script ?? [
    {
      decision: "denied",
      outcome: "insufficient-policy",
      denialReason: "insufficient-policy (scripted default: no policy rule matched)",
      policyRef: null,
      evaluationRef: null,
    },
  ];
  let cursor = 0;
  return {
    check(request) {
      receivedRequests.push({ ...request });
      const verdict = script[Math.min(cursor, script.length - 1)];
      cursor += 1;
      return verdict === undefined
        ? {
            decision: "denied",
            outcome: "insufficient-policy",
            denialReason: "insufficient-policy (scripted default: no policy rule matched)",
            policyRef: null,
            evaluationRef: null,
          }
        : { ...verdict };
    },
    receivedRequests,
  };
}

// ---------------------------------------------------------------------------
// The rights/assets gate double (scriptable frame + coverage)
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryRightsGatePort}. */
export interface InMemoryRightsGatePortOptions {
  /** The scripted frame verdicts, in order (last repeats; default: nothing active). */
  readonly frameScript?: readonly ProductionEntryRightsFrameVerdict[];
  /** The scripted coverage verdicts, in order (last repeats; default: nothing covered). */
  readonly coverageScript?: readonly ProductionEntryCoverageVerdict[];
}

/** Create the disclosed rights-gate double (call log for assertions). */
export function createInMemoryRightsGatePort(
  options: InMemoryRightsGatePortOptions = {},
): ProductionEntryRightsGatePort & {
  /** Test inspection: every frame/coverage request the bridge emitted. */
  readonly receivedFrameRequests: readonly ProductionEntryRightsFrameRequest[];
  readonly receivedCoverageRequests: readonly ProductionEntryCoverageRequest[];
} {
  const receivedFrameRequests: ProductionEntryRightsFrameRequest[] = [];
  const receivedCoverageRequests: ProductionEntryCoverageRequest[] = [];
  const nothingActive: ProductionEntryRightsFrameVerdict = {
    resolutions: [],
    frameActive: false,
  };
  const nothingCovered: ProductionEntryCoverageVerdict = {
    verdicts: [],
    allCovered: false,
  };
  const frameScript = options.frameScript ?? [nothingActive];
  const coverageScript = options.coverageScript ?? [nothingCovered];
  let frameCursor = 0;
  let coverageCursor = 0;
  return {
    resolveFrame(request) {
      receivedFrameRequests.push({ ...request });
      const verdict = frameScript[Math.min(frameCursor, frameScript.length - 1)] ?? nothingActive;
      frameCursor += 1;
      return {
        resolutions: verdict.resolutions.map((resolution: LabToStudioRightsFrameResolution) => ({ ...resolution })),
        frameActive: verdict.frameActive,
      };
    },
    evaluateCoverage(request) {
      receivedCoverageRequests.push({ ...request });
      const verdict = coverageScript[Math.min(coverageCursor, coverageScript.length - 1)] ?? nothingCovered;
      coverageCursor += 1;
      return {
        verdicts: verdict.verdicts.map((entry: LabToStudioRightsSubjectVerdict) => ({ ...entry })),
        allCovered: verdict.allCovered,
      };
    },
    receivedFrameRequests,
    receivedCoverageRequests,
  };
}

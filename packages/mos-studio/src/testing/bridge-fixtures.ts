/**
 * DISCLOSED BRIDGE-001 test fixtures — the composed bridge WORLD (the REAL
 * studio runtime + REAL rights authority + disclosed mission/policy doubles
 * + the append-only entry store) plus the entry-request builder and shared
 * assertion helpers. The REAL production program search world (LAB-016's
 * own search over its disclosed seams) lives in bridge-search-fixtures.ts;
 * the shared fixture identity constants live in bridge-world-refs.ts.
 *
 * Every authority the BRIDGE consults at its gates is REAL in the in-package
 * battery (the studio runtime, the rights repository + evaluateRights
 * cascade) or a disclosed double (mission/policy) that
 * compat/bridge-real-authorities.test.ts replaces with the REAL
 * @mos/policy + @mos/missions authorities.
 */

import type { RankedCandidateProgram, ProductionProgramSearchResult } from "@mos/production";
import type { Version } from "@mos/contracts";
import type { RightsAction, RightsRepository } from "@mos/rights";

import {
  BRIDGE_ACTOR,
  BRIDGE_CONSENT_REF,
  BRIDGE_MISSION_REF,
  BRIDGE_POLICY_REF,
  BRIDGE_RIGHTS_REF,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
} from "./bridge-world-refs.js";
import {
  BRIDGE_SOURCE_ARTIFACTS,
  BRIDGE_STUDIO_ORGANIZATION,
  firstStudioCandidateOf,
  runBridgeSearch,
} from "./bridge-search-fixtures.js";

// Re-exported for the bridge batteries (one import site per name — the tests
// keep importing the whole fixture world from this module).
export {
  BRIDGE_SOURCE_ARTIFACTS,
  BRIDGE_STUDIO_ORGANIZATION,
  firstStudioCandidateOf,
  runBridgeSearch,
} from "./bridge-search-fixtures.js";
export {
  BRIDGE_ACTOR,
  BRIDGE_CONSENT_REF,
  BRIDGE_MISSION_REF,
  BRIDGE_NOW,
  BRIDGE_POLICY_REF,
  BRIDGE_RIGHTS_REF,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
} from "./bridge-world-refs.js";


import { composeTestRuntime, createDeterministicClock } from "./compose-runtime-for-tests.js";
import { createInMemorySessionDirectory } from "./in-memory-session-directory.js";
import {
  createInMemoryBridgeMissionPort,
  createInMemoryProductionEntryPolicyGatePort,
  createInMemoryRightsGatePort,
} from "../bridge/adapters/in-memory-bridge-authorities.js";
import type { InMemoryRightsGatePortOptions } from "../bridge/adapters/in-memory-bridge-authorities.js";
import { createRealBridgeRightsGate } from "./real-bridge-authorities.js";
import { createLabToStudioBridge } from "../bridge/lab-to-studio-bridge.js";
import type { LabToStudioBridgePort } from "../bridge/lab-to-studio-bridge.js";
import type { LabToStudioEntryStore } from "../bridge/bridge-entry-store.js";
import type {
  BridgeMissionPort,
  BridgeMissionSnapshot,
  ProductionEntryPolicyCheckRequest,
  ProductionEntryPolicyGatePort,
  ProductionEntryPolicyVerdict,
  ProductionEntryRightsGatePort,
} from "../bridge/contracts/bridge-authority-ports.js";
import type { LabToStudioEntryRequest } from "../bridge/contracts/lab-to-studio-entry.js";
import type {
  StudioSessionDirectory,
  StudioSessionSummaryRecord,
} from "../ports/session-directory.port.js";
import type { StudioArtifactPackagingPort } from "../ports/artifact-packaging.port.js";
import type { StudioRuntime } from "../runtime/studio-runtime.js";
import type { Timestamp as StudioTimestamp } from "../contracts/refs.js";

// ---------------------------------------------------------------------------
// The mission / policy doubles (disclosed; REAL twins in the compat battery)
// ---------------------------------------------------------------------------

/** The active mission snapshot the disclosed double resolves. */
export const BRIDGE_MISSION_SNAPSHOT: BridgeMissionSnapshot = {
  id: BRIDGE_MISSION_REF,
  tenantId: BRIDGE_TENANT,
  version: 4,
  status: "active",
  rewardSpec: { version: 2 },
  objective: { statement: "Grow qualified reach through reaction-video experiments" },
};

/** The default PERMITTED verdict the disclosed policy double scripts. */
export const BRIDGE_PERMITTED_VERDICT: ProductionEntryPolicyVerdict = {
  decision: "permitted",
  outcome: "allowed",
  denialReason: null,
  policyRef: BRIDGE_POLICY_REF,
  evaluationRef: "policy-evaluation:bridge-fixture-1",
};

// ---------------------------------------------------------------------------
// The composed bridge world (REAL studio runtime + REAL rights + doubles)
// ---------------------------------------------------------------------------

/** The composed BRIDGE-001 test world. */
export interface ComposedBridgeWorld {
  readonly bridge: LabToStudioBridgePort & { readonly entryStore: LabToStudioEntryStore };
  readonly runtime: StudioRuntime;
  readonly sessionDirectory: StudioSessionDirectory & {
    readonly recordedSummaries: readonly StudioSessionSummaryRecord[];
  };
  readonly packaging: StudioArtifactPackagingPort;
  /** The runtime's shared artifact factory (processing-artifact lineage). */
  readonly artifactFactory: ReturnType<typeof composeTestRuntime>["artifactFactory"];
  /** The REAL participant authorities behind the runtime's ports. */
  readonly authorities: ReturnType<typeof composeTestRuntime>["authorities"];
  readonly mission: BridgeMissionPort & {
    readonly requestedLookups: readonly {
      readonly tenantId: string;
      readonly missionRef: string;
      readonly version: number;
    }[];
  };
  readonly policyGate: ProductionEntryPolicyGatePort & {
    readonly receivedRequests: readonly ProductionEntryPolicyCheckRequest[];
  };
  /** The disclosed rights-gate double options actually wired ({} = REAL gate). */
  readonly rightsGateDouble: InMemoryRightsGatePortOptions | undefined;
  /** The REAL rights gate over the REAL repository. */
  readonly realRightsGate: ProductionEntryRightsGatePort;
  /** The disclosed rights-gate double, when one was wired (call-log access). */
  readonly rightsGateDoublePort:
    | (ProductionEntryRightsGatePort & {
        readonly receivedFrameRequests: readonly import("../bridge/contracts/bridge-authority-ports.js").ProductionEntryRightsFrameRequest[];
        readonly receivedCoverageRequests: readonly import("../bridge/contracts/bridge-authority-ports.js").ProductionEntryCoverageRequest[];
      })
    | undefined;
  readonly clock: () => StudioTimestamp;
  /** The REAL rights repository (the rights authority behind the gate). */
  readonly rightsRepository: RightsRepository;
  /** Seed REAL rights grants covering the fixture source artifacts. */
  grantFixtureSourceRights(input?: {
    readonly actions?: readonly RightsAction[];
    readonly subjects?: readonly string[];
    readonly grantee?: string;
    readonly grantId?: string;
    readonly expiresAt?: string | null;
  }): void;
}

/** Options of {@link composeBridgeWorld}. */
export interface ComposeBridgeWorldOptions {
  /** Overrides the policy double's script (default: one permitted verdict). */
  readonly policyScript?: readonly ProductionEntryPolicyVerdict[];
  /** Overrides the mission double's missions (default: the active fixture). */
  readonly missions?: readonly BridgeMissionSnapshot[];
  /** Wires the disclosed rights-gate double INSTEAD of the REAL rights gate. */
  readonly rightsGateDouble?: InMemoryRightsGatePortOptions;
  /** Wraps the runtime the bridge holds (the gate-order invocation spy). */
  readonly wrapRuntime?: (runtime: StudioRuntime) => StudioRuntime;
  /** Overrides the studio organization source seeds (default: the fixture org). */
  readonly studioOrganizations?: readonly { id: string; version: number; declaredCapabilities: readonly string[] }[];
}

/** Compose the BRIDGE-001 test world (one deterministic composition). */
export function composeBridgeWorld(
  options: ComposeBridgeWorldOptions = {},
): ComposedBridgeWorld {
  // ONE fresh ticking clock per world (+1s per call — the runtime's own
  // convention): each world is deterministic regardless of test order, and
  // the rights repository's `grantedAt` / the bridge's gate `now` values
  // advance together so expiry-edge probes are expressible against the
  // REAL rights authority.
  const clock = createDeterministicClock(Date.UTC(2026, 5, 1, 0, 0, 1)) as () => StudioTimestamp;
  const sessionDirectory = createInMemorySessionDirectory();
  const composed = composeTestRuntime({
    organizations: options.studioOrganizations ?? [BRIDGE_STUDIO_ORGANIZATION],
    sessionDirectory,
    clock,
  });
  const rightsRepository = composed.authorities.rightsRepository;

  const grantFixtureSourceRights = (input: {
    readonly actions?: readonly RightsAction[];
    readonly subjects?: readonly string[];
    readonly grantee?: string;
    readonly grantId?: string;
    readonly expiresAt?: string | null;
    readonly recordConsent?: boolean;
  } = {}): void => {
    const subjects =
      input.subjects ??
      BRIDGE_SOURCE_ARTIFACTS.flatMap((source) => [String(source.artifactId), String(source.storageRef)]);
    const granted = rightsRepository.grantRights({
      scope: BRIDGE_SCOPE,
      id: (input.grantId ?? "rights:bridge-source-grant") as never,
      grantee: (input.grantee ?? String(BRIDGE_ACTOR)) as never,
      actions: input.actions ?? ["use", "transform"],
      subjectRefs: subjects,
      sourceRefs: ["license:bridge-fixture-source"],
      terms: {
        attributionRequired: true,
        commercialUseAllowed: false,
        derivationAllowed: true,
        notes: null,
      },
      expiresAt: input.expiresAt ?? null,
    });
    if ("error" in granted) {
      throw new Error(`REAL rights repository rejected the fixture grant: ${granted.message}`);
    }
    if (input.recordConsent ?? true) {
      // The declared frame's consent record (the fixture rightsContext cites
      // it; the REAL rights gate resolves it active in-tenant).
      const consent = rightsRepository.recordConsent({
        scope: BRIDGE_SCOPE,
        id: BRIDGE_CONSENT_REF as never,
        participantRef: (input.grantee ?? String(BRIDGE_ACTOR)) as never,
        purpose: "bridge fixture source production",
        actions: ["use", "transform"],
        subjectRefs: subjects,
      });
      if ("error" in consent) {
        throw new Error(`REAL rights repository rejected the fixture consent: ${consent.message}`);
      }
    }
  };

  const mission = createInMemoryBridgeMissionPort({
    missions: options.missions ?? [BRIDGE_MISSION_SNAPSHOT],
  });
  const policyGate = createInMemoryProductionEntryPolicyGatePort({
    script: options.policyScript ?? [BRIDGE_PERMITTED_VERDICT],
  });
  const realRightsGate = createRealBridgeRightsGate({ repository: rightsRepository });
  const rightsGateDoublePort =
    options.rightsGateDouble === undefined ? undefined : createInMemoryRightsGatePort(options.rightsGateDouble);

  const bridge = createLabToStudioBridge({
    runtime: options.wrapRuntime === undefined ? composed.runtime : options.wrapRuntime(composed.runtime),
    mission,
    policyGate,
    rightsGate: rightsGateDoublePort ?? realRightsGate,
    sessionDirectory,
    packaging: composed.packaging,
    clock,
    nextEntryId: (() => {
      let counter = 0;
      return () => `lts_bridge_${String(++counter).padStart(3, "0")}`;
    })(),
  });

  return {
    bridge,
    runtime: composed.runtime,
    sessionDirectory,
    packaging: composed.packaging,
    artifactFactory: composed.artifactFactory,
    authorities: composed.authorities,
    mission,
    policyGate,
    rightsGateDouble: options.rightsGateDouble,
    rightsGateDoublePort,
    realRightsGate,
    clock,
    rightsRepository,
    grantFixtureSourceRights,
  };
}

// ---------------------------------------------------------------------------
// The entry-request builder
// ---------------------------------------------------------------------------

/** Build one entry request over a REAL search result's own candidate. */
export function bridgeEntryRequestOf(
  result: ProductionProgramSearchResult,
  selected: RankedCandidateProgram | ProductionProgramSearchResult["noopBaseline"],
  overrides: Partial<LabToStudioEntryRequest> = {},
): LabToStudioEntryRequest {
  return {
    // A FRESH scope object per request — the caller-aliasing probes mutate
    // their own scope object after the call (the module-level BRIDGE_SCOPE
    // singleton is FROZEN transitively by the REAL @mos/production search,
    // which freezes its caller's input record in place — disclosed in the
    // W11-C report; the bridge itself never freezes caller objects).
    scope: { tenantId: BRIDGE_TENANT },
    actor: BRIDGE_ACTOR,
    searchResult: result,
    selected,
    missionVersion: 4,
    policy: [{ id: BRIDGE_POLICY_REF, version: 1 as Version }],
    formatVersion: 1,
    intake: {
      inputKind: "intent-with-source-material",
      participantCount: 1,
      hasScriptOrQuestionGraph: false,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared assertion helpers
// ---------------------------------------------------------------------------

/** Enter production and assert the entered outcome (fail loud on denial). */
export async function mustEnter(
  bridge: LabToStudioBridgePort,
  request: LabToStudioEntryRequest,
): Promise<
  Extract<Awaited<ReturnType<LabToStudioBridgePort["enterProduction"]>>, { ok: true }>["value"]
> {
  const outcome = await bridge.enterProduction(request);
  if (!outcome.ok) {
    throw new Error(`bridge entry failed: ${outcome.error.kind} — ${outcome.error.reason}`);
  }
  return outcome.value;
}

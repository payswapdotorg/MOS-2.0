/**
 * INTERNAL candidate synthesis for the production program search
 * (LAB-016) — NOT exported from the package index.
 *
 * The NO-OP/REPOST BASELINE is synthesized on EVERY search (§7/lock
 * rule 5 — the empty-chain repost: no transforms, no pawns, no model
 * assignments, no engine portfolio, no human tasks, no acquisitions,
 * zero budget, zero wait; the §18 delay terms are zero BY CONSTRUCTION
 * with a declared-assumption provenance note). The generation-root SEED
 * PROGRAM is synthesized deterministically from the resolved context's
 * first entries + the input's declared frames — the no-op baseline
 * itself is NEVER a generation parent (documented design call: the
 * coarse no-op→program jump is the seed program's job).
 */

import type { CandidateProgram } from "../contracts/program-candidate.js";
import { NO_OP_PROGRAM_REFS } from "../contracts/program-candidate.js";
import type { ProgramSearchContext } from "./program-search-validation.js";
import { deadlineAt } from "./program-search-validation.js";

// ---------------------------------------------------------------------------
// Synthesis: the no-op baseline + the seed program
// ---------------------------------------------------------------------------

/** THE NO-OP/REPOST BASELINE — synthesized on every search (§7 pin). */
export const synthesizeNoopBaseline = (
  context: ProgramSearchContext,
): CandidateProgram => {
  const { input, policy } = context;
  return {
    isNoopBaseline: true,
    transformChain: [],
    modality: policy.modalityVocabulary[0] ?? "automated",
    studioFormat: NO_OP_PROGRAM_REFS.studioFormat,
    organization: null,
    pawnAgents: [],
    modelAssignments: [],
    enginePortfolio: [],
    humanTasks: [],
    capabilityAcquisition: [],
    qualityThresholds: {
      floor: 0,
      evaluatorRef: input.qualityEvaluatorRef,
    },
    budget: {
      maxCost: { amount: 0, currency: input.baseBudget.maxCost.currency },
      maxDurationMs: 0,
    },
    deadline: input.deadlineAnchor,
    expectedDurationMs: 0,
    delayPolicy: { maxWaitMs: 0, onDelayExceeded: "proceed-without-human" },
    delayExpectation: {
      expectedIncrementalValue: 0,
      estimatedWaitMs: 0,
      delayCost: 0,
      acquisitionCost: 0,
      successProbability: 0,
      qualityImpact: 0,
      provenance: {
        kind: "declared-assumption",
        note: "the no-op repost waits for nothing — zero §18 delay terms by construction",
      },
    },
    stoppingPolicy: {
      maxRetries: 0,
      substitutionPreference: [...input.substitutionPreference],
    },
  };
};

/** The generation-root seed program (deterministic first-entry synthesis). */
export const synthesizeSeedProgram = (
  context: ProgramSearchContext,
): CandidateProgram => {
  const { input, policy, chainVocabulary, organizations } = context;
  const definition = chainVocabulary[0];
  const organization = organizations[0];
  if (definition === undefined || organization === undefined) {
    throw new Error("unreachable: the resolved context guarantees both listings are non-empty");
  }
  const preset = policy.parameterPresetVocabulary[0] ?? "default";
  const step = Object.freeze({
    definitionId: definition.id,
    definitionVersion: definition.version,
    parameterPreset: preset,
    parameters: Object.freeze({ preset }),
  });
  const acquisitions = definition.capabilityRequirements.map((requirement) => {
    const binding = policy.engineVocabulary.find(
      (b) =>
        b.capabilityId === requirement.capabilityId &&
        b.capabilityVersion === requirement.version,
    );
    return {
      requirement: { capabilityId: requirement.capabilityId, version: requirement.version },
      mode: binding === undefined ? ("existing" as const) : ("engine" as const),
    };
  });
  const portfolio = acquisitions
    .filter((entry) => entry.mode === "engine")
    .map((entry) =>
      policy.engineVocabulary.find(
        (b) =>
          b.capabilityId === entry.requirement.capabilityId &&
          b.capabilityVersion === entry.requirement.version,
      ),
    )
    .filter((b): b is NonNullable<typeof b> => b !== undefined)
    .map((b) => ({ ...b }));
  const duration = policy.expectedDurationLadderMs[0] ?? 0;
  return {
    isNoopBaseline: false,
    transformChain: [step],
    modality: policy.modalityVocabulary[0] ?? "automated",
    studioFormat: input.studioFormatVocabulary[0] ?? NO_OP_PROGRAM_REFS.studioFormat,
    organization: {
      organizationId: organization.id,
      organizationVersion: organization.version,
    },
    pawnAgents: [],
    modelAssignments: [],
    enginePortfolio: portfolio,
    humanTasks: [],
    capabilityAcquisition: acquisitions,
    qualityThresholds: {
      floor: policy.qualityFloorLadder[0] ?? 0,
      evaluatorRef: input.qualityEvaluatorRef,
    },
    budget: { maxCost: { ...input.baseBudget.maxCost }, maxDurationMs: input.baseBudget.maxDurationMs },
    deadline: deadlineAt(input.deadlineAnchor, duration),
    expectedDurationMs: duration,
    delayPolicy: {
      maxWaitMs: policy.waitHorizonLadderMs[0] ?? 0,
      onDelayExceeded: "proceed-without-human",
    },
    delayExpectation: { ...input.delayExpectation },
    stoppingPolicy: {
      maxRetries: 0,
      substitutionPreference: [...input.substitutionPreference],
    },
  };
};


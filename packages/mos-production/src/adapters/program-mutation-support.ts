/**
 * INTERNAL mutation support for the production program search (LAB-016)
 * — NOT exported from the package index: the structural candidate clone,
 * the chain-coherence rebuild (acquisition coverage + engine portfolio
 * follow the chain), the step constructor and the delay-action cycle.
 */

import type { ResolvedPawnTransform } from "../ports/transform-source.port.js";
import { chainRequirementsOf } from "./program-search-validation.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import type { ProgramTransformStep } from "../contracts/program-candidate.js";
import type { ProgramFeatureFingerprint } from "../contracts/program-dimensions.js";
import type { ProgramSearchDimension } from "../contracts/program-dimensions.js";

/** Quantization to 1e-10 (deterministic floating-point discipline). */
export const q = (value: number): number => Math.round(value * 1e10) / 1e10;

/** Shallow-writable working copy of a candidate program (mutation-local). */
export type WritableCandidateProgram = {
  -readonly [K in keyof CandidateProgram]: CandidateProgram[K];
};

/** Structural clone of one candidate (mutation-local working copy). */
export const cloneProgram = (candidate: CandidateProgram): WritableCandidateProgram => ({
  isNoopBaseline: candidate.isNoopBaseline,
  transformChain: candidate.transformChain.map((step) => ({ ...step })),
  modality: candidate.modality,
  studioFormat: candidate.studioFormat,
  organization: candidate.organization === null ? null : { ...candidate.organization },
  pawnAgents: [...candidate.pawnAgents],
  modelAssignments: candidate.modelAssignments.map((a) => ({ ...a })),
  enginePortfolio: candidate.enginePortfolio.map((b) => ({ ...b })),
  humanTasks: [...candidate.humanTasks],
  capabilityAcquisition: candidate.capabilityAcquisition.map((a) => ({
    requirement: { ...a.requirement },
    mode: a.mode,
  })),
  qualityThresholds: { ...candidate.qualityThresholds },
  budget: {
    maxCost: { ...candidate.budget.maxCost },
    maxDurationMs: candidate.budget.maxDurationMs,
  },
  deadline: candidate.deadline,
  expectedDurationMs: candidate.expectedDurationMs,
  delayPolicy: { ...candidate.delayPolicy },
  delayExpectation: { ...candidate.delayExpectation },
  stoppingPolicy: {
    maxRetries: candidate.stoppingPolicy.maxRetries,
    substitutionPreference: [...candidate.stoppingPolicy.substitutionPreference],
  },
});

/**
 * One dimension mutation: the mutant, its precomputed sixteen-dimension
 * fingerprint (the search dedups on it), the fingerprint key, and the
 * dimensions that ACTUALLY varied — the FULL fingerprint diff vs the
 * parent (the operator's primary dimension plus any coherence dimensions
 * rebuilt with it: the honest provenance, exactly what varied).
 */
export interface ProgramMutation {
  readonly candidate: CandidateProgram;
  readonly fingerprint: ProgramFeatureFingerprint;
  readonly key: string;
  readonly variedDimensions: readonly ProgramSearchDimension[];
}

// ---------------------------------------------------------------------------
// Chain coherence (acquisition coverage + portfolio follow the chain)
// ---------------------------------------------------------------------------

/**
 * Rebuilds the acquisition plan + portfolio coherently for a new chain:
 * prior entries keep their mode when their requirement survives; new
 * requirements default to ENGINE acquisition when the declared engine
 * vocabulary covers them (the binding joins the portfolio), otherwise
 * EXISTING (the registered capability is used as-is).
 */
export const withChain = (
  candidate: CandidateProgram,
  chain: readonly ProgramTransformStep[],
  resolved: readonly ResolvedPawnTransform[],
  engineVocabulary: CandidateProgram["enginePortfolio"],
): CandidateProgram => {
  const required = chainRequirementsOf({ ...candidate, transformChain: chain }, resolved);
  const priorByKey = new Map(
    candidate.capabilityAcquisition.map((entry) => [
      `${entry.requirement.capabilityId as string}@${entry.requirement.version as number}`,
      entry,
    ]),
  );
  const capabilityAcquisition = required.map((requirement) => {
    const key = `${requirement.capabilityId as string}@${requirement.version as number}`;
    const prior = priorByKey.get(key);
    if (prior !== undefined) {
      return { requirement: { ...prior.requirement }, mode: prior.mode };
    }
    const binding = engineVocabulary.find(
      (b) =>
        b.capabilityId === requirement.capabilityId &&
        b.capabilityVersion === requirement.version,
    );
    return {
      requirement: { capabilityId: requirement.capabilityId, version: requirement.version },
      mode: binding === undefined ? ("existing" as const) : ("engine" as const),
    };
  });
  const neededBindings = capabilityAcquisition
    .filter((entry) => entry.mode === "engine")
    .map((entry) =>
      engineVocabulary.find(
        (b) =>
          b.capabilityId === entry.requirement.capabilityId &&
          b.capabilityVersion === entry.requirement.version,
      ),
    )
    .filter((b): b is NonNullable<typeof b> => b !== undefined);
  const portfolioByKey = new Map(
    [...candidate.enginePortfolio, ...neededBindings].map((b) => [
      `${b.capabilityId as string}@${b.capabilityVersion as number}:${b.engineId as string}@${b.engineVersion as number}`,
      b,
    ]),
  );
  return {
    ...cloneProgram(candidate),
    transformChain: chain.map((step) => ({ ...step })),
    capabilityAcquisition,
    enginePortfolio: [...portfolioByKey.values()].map((b) => ({ ...b })),
  };
};

export const stepOf = (definition: ResolvedPawnTransform, preset: string): ProgramTransformStep =>
  Object.freeze({
    definitionId: definition.id,
    definitionVersion: definition.version,
    parameterPreset: preset,
    parameters: Object.freeze({ preset }),
  });

const DELAY_ACTIONS: readonly CandidateProgram["delayPolicy"]["onDelayExceeded"][] = [
  "proceed-without-human",
  "substitute",
  "abandon",
];

export const nextDelayAction = (
  action: CandidateProgram["delayPolicy"]["onDelayExceeded"],
): CandidateProgram["delayPolicy"]["onDelayExceeded"] => {
  const index = DELAY_ACTIONS.indexOf(action);
  return DELAY_ACTIONS[(index + 1) % DELAY_ACTIONS.length] ?? action;
};

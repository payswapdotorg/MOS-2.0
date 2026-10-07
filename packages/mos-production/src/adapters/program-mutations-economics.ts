/**
 * INTERNAL sixteen-dimension mutation operators (LAB-016), part 2 — the
 * ECONOMICS dimensions (9–16) — NOT exported from the package index.
 *
 * Split from program-mutations.ts to respect the oxlint max-lines budget
 * (the W3-A/W5-A split precedent). Same discipline: deterministic
 * single-primary-dimension operators; the coherence dimensions that must
 * move with them vary WITH them and the recorded varied dimensions are
 * the FULL sixteen-dimension fingerprint diff vs the parent (computed in
 * program-mutations.ts's operator table).
 *
 * - Dimension 9: engine portfolio (registry vocabulary, exact versions);
 * - Dimension 10: human participation (LAB-014 task refs, by reference);
 * - Dimension 11: capability acquisition (§21 human/engine acquisition);
 * - Dimension 12: quality thresholds (the floor ladder);
 * - Dimension 13: cost (the budget scale factor);
 * - Dimension 14: latency (the expected-duration ladder);
 * - Dimension 15: expected value of delay (the §2 first-class variable —
 *   the wait-horizon ladder + the delay-exceeded action);
 * - Dimension 16: stopping/substitution policy (retry cap + rotation).
 */

import { deadlineAt } from "./program-search-validation.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import type { ProgramSearchContext } from "./program-search-validation.js";
import {
  cloneProgram,
  nextDelayAction,
  q,
} from "./program-mutation-support.js";

/** Dimension 9: engine portfolio (add the next unused binding; drop the last droppable). */
export const mutateEnginePortfolio = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
  generationIndex: number,
): CandidateProgram | null => {
  const vocabulary = context.policy.engineVocabulary;
  const inUse = (binding: CandidateProgram["enginePortfolio"][number]): boolean =>
    candidate.enginePortfolio.some(
      (b) =>
        b.capabilityId === binding.capabilityId &&
        b.capabilityVersion === binding.capabilityVersion &&
        b.engineId === binding.engineId &&
        b.engineVersion === binding.engineVersion,
    );
  const unused = vocabulary.filter((b) => !inUse(b));
  if (unused.length > 0) {
    const binding = unused[generationIndex % unused.length];
    if (binding === undefined) return null;
    const mutant = cloneProgram(candidate);
    mutant.enginePortfolio = [...candidate.enginePortfolio, { ...binding }];
    return mutant;
  }
  // Drop the last binding that does not serve an engine-mode acquisition.
  const servesAcquisition = (binding: CandidateProgram["enginePortfolio"][number]): boolean =>
    candidate.capabilityAcquisition.some(
      (entry) =>
        entry.mode === "engine" &&
        entry.requirement.capabilityId === binding.capabilityId &&
        entry.requirement.version === binding.capabilityVersion,
    );
  for (let index = candidate.enginePortfolio.length - 1; index >= 0; index -= 1) {
    const binding = candidate.enginePortfolio[index];
    if (binding !== undefined && !servesAcquisition(binding)) {
      const mutant = cloneProgram(candidate);
      mutant.enginePortfolio = candidate.enginePortfolio.filter((_, i) => i !== index);
      return mutant;
    }
  }
  return null;
};

/** Dimension 10: human participation (add the next task ref; drop the last at the cap). */
export const mutateHumanParticipation = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
  generationIndex: number,
): CandidateProgram | null => {
  const vocabulary = context.input.humanTaskVocabulary;
  if (vocabulary.length === 0) return null;
  const tasks = candidate.humanTasks;
  if (tasks.length >= vocabulary.length) {
    if (tasks.length === 0) return null;
    const mutant = cloneProgram(candidate);
    mutant.humanTasks = tasks.slice(0, -1);
    // A dropped task may leave human-mode acquisitions uncovered → those
    // acquisitions degrade to 'existing' (the registered capability).
    mutant.capabilityAcquisition = mutant.capabilityAcquisition.map((entry) =>
      entry.mode === "human" && mutant.humanTasks.length === 0
        ? { requirement: { ...entry.requirement }, mode: "existing" as const }
        : entry,
    );
    return mutant;
  }
  const start = (tasks.length + generationIndex) % vocabulary.length;
  for (let offset = 0; offset < vocabulary.length; offset += 1) {
    const taskId = vocabulary[(start + offset) % vocabulary.length];
    if (taskId !== undefined && !tasks.includes(taskId)) {
      const mutant = cloneProgram(candidate);
      mutant.humanTasks = [...tasks, taskId];
      return mutant;
    }
  }
  return null;
};

/** Dimension 11: capability acquisition (advance the first advanceable mode). */
export const mutateCapabilityAcquisition = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const modes: readonly CandidateProgram["capabilityAcquisition"][number]["mode"][] = [
    "existing",
    "engine",
    "human",
  ];
  for (let index = 0; index < candidate.capabilityAcquisition.length; index += 1) {
    const entry = candidate.capabilityAcquisition[index];
    if (entry === undefined) continue;
    const modeIndex = modes.indexOf(entry.mode);
    for (let step = 1; step <= modes.length; step += 1) {
      const nextMode = modes[(modeIndex + step) % modes.length];
      if (nextMode === undefined || nextMode === entry.mode) continue;
      if (nextMode === "engine") {
        const covered = context.policy.engineVocabulary.some(
          (b) =>
            b.capabilityId === entry.requirement.capabilityId &&
            b.capabilityVersion === entry.requirement.version,
        );
        if (!covered) continue;
      }
      if (nextMode === "human" && candidate.humanTasks.length === 0) continue;
      const mutant = cloneProgram(candidate);
      mutant.capabilityAcquisition = mutant.capabilityAcquisition.map((e, i) =>
        i === index ? { requirement: { ...e.requirement }, mode: nextMode } : e,
      );
      if (nextMode === "engine") {
        const binding = context.policy.engineVocabulary.find(
          (b) =>
            b.capabilityId === entry.requirement.capabilityId &&
            b.capabilityVersion === entry.requirement.version,
        );
        if (
          binding !== undefined &&
          !mutant.enginePortfolio.some(
            (b) =>
              b.capabilityId === binding.capabilityId &&
              b.capabilityVersion === binding.capabilityVersion &&
              b.engineId === binding.engineId &&
              b.engineVersion === binding.engineVersion,
          )
        ) {
          mutant.enginePortfolio = [...mutant.enginePortfolio, { ...binding }];
        }
      }
      return mutant;
    }
  }
  return null;
};

/** Dimension 12: quality thresholds (advance the floor rung). */
export const mutateQualityThresholds = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const ladder = context.policy.qualityFloorLadder;
  if (ladder.length < 2) return null;
  const index = ladder.indexOf(candidate.qualityThresholds.floor);
  const next = ladder[(index + 1) % ladder.length];
  if (next === undefined || next === candidate.qualityThresholds.floor) return null;
  const mutant = cloneProgram(candidate);
  mutant.qualityThresholds = { ...candidate.qualityThresholds, floor: next };
  return mutant;
};

/** Dimension 13: cost (scale the budget amount). */
export const mutateCost = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const mutant = cloneProgram(candidate);
  mutant.budget = {
    maxCost: {
      amount: q(candidate.budget.maxCost.amount * context.policy.budgetScaleFactor),
      currency: candidate.budget.maxCost.currency,
    },
    maxDurationMs: candidate.budget.maxDurationMs,
  };
  return mutant;
};

/** Dimension 14: latency (advance the duration rung; deadline follows). */
export const mutateLatency = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const ladder = context.policy.expectedDurationLadderMs;
  if (ladder.length < 2) return null;
  const index = ladder.indexOf(candidate.expectedDurationMs);
  const next = ladder[(index + 1) % ladder.length];
  if (next === undefined || next === candidate.expectedDurationMs) return null;
  const mutant = cloneProgram(candidate);
  mutant.expectedDurationMs = next;
  mutant.deadline = deadlineAt(context.input.deadlineAnchor, next);
  return mutant;
};

/** Dimension 15: expected value of delay (advance the wait rung; action cycles on wrap). */
export const mutateExpectedValueOfDelay = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const ladder = context.policy.waitHorizonLadderMs;
  if (ladder.length < 2) return null;
  const index = ladder.indexOf(candidate.delayPolicy.maxWaitMs);
  const next = ladder[(index + 1) % ladder.length];
  if (next === undefined || next === candidate.delayPolicy.maxWaitMs) return null;
  const mutant = cloneProgram(candidate);
  mutant.delayPolicy = {
    maxWaitMs: next,
    onDelayExceeded:
      index + 1 >= ladder.length
        ? nextDelayAction(candidate.delayPolicy.onDelayExceeded)
        : candidate.delayPolicy.onDelayExceeded,
  };
  mutant.delayExpectation = {
    ...candidate.delayExpectation,
    estimatedWaitMs: next,
  };
  return mutant;
};

/** Dimension 16: stopping/substitution policy (advance retries; rotate preference on wrap). */
export const mutateStoppingPolicy = (
  candidate: CandidateProgram,
  context: ProgramSearchContext,
): CandidateProgram | null => {
  const cap = context.policy.maxRetriesCap;
  const nextRetries = candidate.stoppingPolicy.maxRetries + 1;
  const mutant = cloneProgram(candidate);
  if (nextRetries > cap) {
    const head = candidate.stoppingPolicy.substitutionPreference[0];
    if (head === undefined) return null;
    mutant.stoppingPolicy = {
      maxRetries: 0,
      substitutionPreference: [
        ...candidate.stoppingPolicy.substitutionPreference.slice(1),
        head,
      ],
    };
    return mutant;
  }
  mutant.stoppingPolicy = {
    ...candidate.stoppingPolicy,
    maxRetries: nextRetries,
  };
  return mutant;
};

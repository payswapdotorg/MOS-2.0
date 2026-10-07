/**
 * INTERNAL hand-designed candidate validation for the production program
 * search (LAB-016) — NOT exported from the package index. Split from
 * program-search-validation.ts to respect the managed-file line budget
 * (the W3-A/W5-A split precedent).
 *
 * Every sixteen-dimension field of a caller-declared candidate program is
 * validated fail-closed: vocabulary membership, seam resolution of cited
 * chain steps (EXACT versions through the W7-B transform-source seam) and
 * organization citations (tenant-scoped), the §9 model-assignment
 * discipline (deterministic pawns NEVER bind a model), engine portfolio
 * exact-version bindings, human task vocabulary membership, capability
 * acquisition coverage, and the delay/stopping declarations.
 */

import type { Budget } from "@mos/contracts";

import type { ResolvedPawnTransform } from "../ports/transform-source.port.js";
import type { ProductionProgramSearchError } from "../contracts/program-search.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import { TRANSFORM_PAWN_KINDS } from "../contracts/pawn-role.js";
import type { ProgramSearchContext } from "./program-search-validation.js";
import { chainRequirementsOf } from "./program-search-validation.js";

const fail = (
  error: ProductionProgramSearchError["error"],
  message: string,
): ProductionProgramSearchError => ({ error, message });

const isBlank = (value: string): boolean => value.trim().length === 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const DELAY_EXCEEDED_ACTIONS: readonly string[] = [
  "proceed-without-human",
  "substitute",
  "abandon",
];

const validBudget = (budget: Budget): boolean =>
  isFiniteNumber(budget.maxCost.amount) &&
  budget.maxCost.amount >= 0 &&
  !isBlank(budget.maxCost.currency) &&
  isFiniteNumber(budget.maxDurationMs) &&
  budget.maxDurationMs >= 0;


/**
 * Validates one hand-designed candidate program (every sixteen-dimension
 * field, vocabulary membership, seam resolution of cited chain steps and
 * organization, acquisition coverage) — fail-closed with named codes.
 */
export async function validateDeclaredCandidate(
  context: ProgramSearchContext,
  candidate: CandidateProgram,
): Promise<ProductionProgramSearchError | null> {
  const { input, policy } = context;
  if (candidate.isNoopBaseline) {
    return fail(
      "caller-claimed-no-op-baseline",
      "only the search synthesizes the no-op baseline (§7: it is always present by construction — a caller candidate may not claim it)",
    );
  }
  if (candidate.transformChain.length === 0) {
    return fail("invalid-candidate", "a program candidate carries a non-empty transform chain (the empty chain IS the no-op baseline)");
  }
  if (candidate.transformChain.length > policy.maxChainSteps) {
    return fail("invalid-candidate", `transform chain length ${candidate.transformChain.length} exceeds policy.maxChainSteps ${policy.maxChainSteps}`);
  }
  if (candidate.modality === undefined || !policy.modalityVocabulary.includes(candidate.modality)) {
    return fail("invalid-candidate", `production modality '${String(candidate.modality)}' is outside the declared modality vocabulary`);
  }
  if (!input.studioFormatVocabulary.includes(candidate.studioFormat)) {
    return fail("invalid-candidate", `studio format '${candidate.studioFormat as string}' is outside the declared studio-format vocabulary`);
  }
  // Chain steps: exact-version resolution + kind discipline + preset vocabulary.
  const resolvedSteps: ResolvedPawnTransform[] = [];
  for (const step of candidate.transformChain) {
    const resolved = await context.transformSource.resolve(
      input.scope,
      step.definitionId,
      step.definitionVersion,
    );
    if (resolved === null) {
      return fail("transform-unresolved", `transform step ${step.definitionId as string}@${step.definitionVersion as number} does not resolve in this tenant scope`);
    }
    if (resolved.kind === "no-op-repost") {
      return fail("no-op-transform-in-chain", `transform step ${step.definitionId as string} is the no-op-repost kind — the no-op path is the empty-chain baseline, never a chain step`);
    }
    if (!policy.parameterPresetVocabulary.includes(step.parameterPreset)) {
      return fail("invalid-candidate", `parameter preset '${step.parameterPreset}' is outside the declared preset vocabulary`);
    }
    if (
      step.parameters === null ||
      typeof step.parameters !== "object" ||
      Array.isArray(step.parameters)
    ) {
      return fail("invalid-candidate", `transform step ${step.definitionId as string} carries a malformed parameters object`);
    }
    resolvedSteps.push(resolved);
  }
  // Organization citation resolves through the org source (tenant-scoped).
  if (
    candidate.organization === null ||
    !context.organizations.some(
      (o) =>
        o.id === candidate.organization?.organizationId &&
        o.version === candidate.organization?.organizationVersion,
    )
  ) {
    return fail(
      "organization-unresolved",
      candidate.organization === null
        ? "a program candidate must cite a producing organization (the null citation is the no-op baseline's)"
        : `organization ${candidate.organization.organizationId}@${candidate.organization.organizationVersion as number} does not resolve in this tenant scope`,
    );
  }
  // Pawn agents.
  if (
    candidate.pawnAgents.some(
      (kind) => !TRANSFORM_PAWN_KINDS.includes(kind),
    ) ||
    new Set(candidate.pawnAgents).size !== candidate.pawnAgents.length
  ) {
    return fail("invalid-candidate", "pawn agents must be unique members of the ten §9 pawn kinds");
  }
  // Model assignments: LLM-flavored only (lock rule 9 discipline).
  const assignedKinds = new Set<string>();
  for (const assignment of candidate.modelAssignments) {
    if (!context.llmFlavoredPawnKinds.includes(assignment.pawnKind)) {
      return fail(
        "model-assignment-for-deterministic-pawn",
        `pawn kind '${assignment.pawnKind}' is deterministic — deterministic pawns NEVER bind a model (§9)`,
      );
    }
    if (!candidate.pawnAgents.includes(assignment.pawnKind)) {
      return fail("invalid-candidate", `model assignment cites pawn kind '${assignment.pawnKind}' which is not among the candidate's pawn agents`);
    }
    if (assignedKinds.has(assignment.pawnKind)) {
      return fail("invalid-candidate", `duplicate model assignment for pawn kind '${assignment.pawnKind}'`);
    }
    assignedKinds.add(assignment.pawnKind);
    if (!policy.modelVocabulary.includes(assignment.modelRef)) {
      return fail("invalid-candidate", `model ref '${assignment.modelRef as string}' is outside the declared single-boundary model vocabulary (DATA refs, never resolved here)`);
    }
  }
  // Engine portfolio: registry vocabulary, exact versions, unique.
  const portfolioKeys = new Set<string>();
  for (const binding of candidate.enginePortfolio) {
    const key = `${binding.capabilityId as string}@${binding.capabilityVersion as number}:${binding.engineId as string}@${binding.engineVersion as number}`;
    if (portfolioKeys.has(key)) {
      return fail("invalid-candidate", `duplicate engine portfolio binding ${key}`);
    }
    portfolioKeys.add(key);
    if (
      !policy.engineVocabulary.some(
        (b) =>
          b.capabilityId === binding.capabilityId &&
          b.capabilityVersion === binding.capabilityVersion &&
          b.engineId === binding.engineId &&
          b.engineVersion === binding.engineVersion,
      )
    ) {
      return fail("invalid-candidate", `engine portfolio binding ${key} is outside the declared engine vocabulary`);
    }
  }
  // Human participation.
  for (const taskId of candidate.humanTasks) {
    if (!input.humanTaskVocabulary.includes(taskId)) {
      return fail("human-task-outside-vocabulary", `human production task ${taskId as string} is outside the declared task vocabulary (LAB-014 refs, by reference only)`);
    }
  }
  if (new Set(candidate.humanTasks.map((t) => t as string)).size !== candidate.humanTasks.length) {
    return fail("invalid-candidate", "human tasks must be unique");
  }
  // Capability acquisition coverage.
  const required = chainRequirementsOf(candidate, resolvedSteps);
  const acquiredKeys = new Set(
    candidate.capabilityAcquisition.map(
      (a) => `${a.requirement.capabilityId as string}@${a.requirement.version as number}`,
    ),
  );
  for (const requirement of required) {
    const key = `${requirement.capabilityId}@${requirement.version}`;
    if (!acquiredKeys.has(key)) {
      return fail("uncovered-capability-requirement", `capability requirement ${key} (declared by the chain) has no acquisition entry`);
    }
  }
  for (const entry of candidate.capabilityAcquisition) {
    const key = `${entry.requirement.capabilityId as string}@${entry.requirement.version as number}`;
    if (!required.some((r) => `${r.capabilityId}@${r.version}` === key)) {
      return fail("invalid-candidate", `acquisition entry ${key} does not correspond to any chain-declared capability requirement`);
    }
    if (entry.mode === "engine") {
      const covered = candidate.enginePortfolio.some(
        (b) =>
          b.capabilityId === entry.requirement.capabilityId &&
          b.capabilityVersion === entry.requirement.version,
      );
      if (!covered) {
        return fail("engine-binding-missing", `engine-mode acquisition of ${key} has no matching engine portfolio binding`);
      }
    }
    if (entry.mode === "human" && candidate.humanTasks.length === 0) {
      return fail("invalid-candidate", `human-mode acquisition of ${key} requires at least one human production task`);
    }
  }
  // Quality thresholds / cost / latency / delay / stopping.
  if (
    !isFiniteNumber(candidate.qualityThresholds.floor) ||
    candidate.qualityThresholds.floor < 0 ||
    candidate.qualityThresholds.floor > 1
  ) {
    return fail("invalid-candidate", "quality threshold floor must be a number in [0, 1]");
  }
  if (isBlank(candidate.qualityThresholds.evaluatorRef as string)) {
    return fail("invalid-candidate", "quality threshold evaluator ref must be non-blank");
  }
  if (!validBudget(candidate.budget)) {
    return fail("invalid-candidate", "candidate budget must be finite and non-negative");
  }
  if (Number.isNaN(Date.parse(candidate.deadline))) {
    return fail("invalid-candidate", "candidate deadline must be an ISO-8601 timestamp");
  }
  if (!isFiniteNumber(candidate.expectedDurationMs) || candidate.expectedDurationMs < 0) {
    return fail("invalid-candidate", "candidate expectedDurationMs must be a finite non-negative number");
  }
  if (
    !isFiniteNumber(candidate.delayPolicy.maxWaitMs) ||
    candidate.delayPolicy.maxWaitMs < 0 ||
    !DELAY_EXCEEDED_ACTIONS.includes(candidate.delayPolicy.onDelayExceeded)
  ) {
    return fail("invalid-candidate", "candidate delayPolicy must carry maxWaitMs >= 0 and one of the frozen DelayExceededAction values");
  }
  const d = candidate.delayExpectation;
  if (
    !isFiniteNumber(d.expectedIncrementalValue) ||
    !isFiniteNumber(d.estimatedWaitMs) ||
    d.estimatedWaitMs < 0 ||
    !isFiniteNumber(d.delayCost) ||
    d.delayCost < 0 ||
    !isFiniteNumber(d.acquisitionCost) ||
    d.acquisitionCost < 0 ||
    !isFiniteNumber(d.successProbability) ||
    d.successProbability < 0 ||
    d.successProbability > 1 ||
    !isFiniteNumber(d.qualityImpact)
  ) {
    return fail("invalid-candidate", "candidate delay expectation terms must be finite (never invented — provenance required)");
  }
  if (
    !Number.isInteger(candidate.stoppingPolicy.maxRetries) ||
    candidate.stoppingPolicy.maxRetries < 0
  ) {
    return fail("invalid-candidate", "stopping policy maxRetries must be an integer >= 0");
  }
  if (
    candidate.stoppingPolicy.substitutionPreference.length === 0 ||
    new Set(candidate.stoppingPolicy.substitutionPreference).size !==
      candidate.stoppingPolicy.substitutionPreference.length
  ) {
    return fail("invalid-candidate", "stopping policy substitution preference must be non-empty and unique");
  }
  return null;
}


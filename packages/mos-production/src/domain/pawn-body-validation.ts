/**
 * Transform pawn body validation (LAB-013) — two fail-closed layers,
 * mirroring the @mos/agents discipline.
 *
 * 1. Required-field completeness — delegated to @mos/contracts
 *    `assertRequiredFields(body, "AgentBody")` (the frozen YAML manifest is
 *    the single authority for the AgentBody required-field list).
 * 2. Pawn-specific coherence — the role vocabulary (kind among the ten,
 *    served kinds among the thirteen, non-empty capabilities), and the
 *    agent-body/role agreement (capabilities identical; engine tool
 *    capabilities ⊆ served capabilities; body tools ⊇ derived engine tool
 *    refs).
 *
 * Pure functions: no registry access, no mutation.
 */

import { assertRequiredFields } from "@mos/contracts";

import { PawnExecutionError } from "./errors.js";
import {
  PAWN_TRANSFORM_KINDS,
  TRANSFORM_PAWN_KINDS,
} from "../contracts/pawn-role.js";
import type {
  PawnEngineToolBinding,
  TransformPawnKind,
} from "../contracts/pawn-role.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";
import { engineToolRef } from "../contracts/pawn-body.js";

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonBlankStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const item of value) {
    if (!isNonBlankString(item)) return undefined;
    items.push(item);
  }
  return items;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEngineToolBinding(
  binding: unknown,
  issues: string[],
): void {
  if (!isPlainObject(binding)) {
    issues.push("every engine tool binding must be an object");
    return;
  }
  for (const field of ["capabilityId", "engineId"] as const) {
    if (!isNonBlankString(binding[field])) {
      issues.push(`engine tool binding ${field} must be a non-blank string`);
    }
  }
  for (const field of ["capabilityVersion", "engineVersion"] as const) {
    const version = binding[field];
    if (!Number.isInteger(version) || (version as number) < 1) {
      issues.push(`engine tool binding ${field} must be an integer >= 1`);
    }
  }
}

/**
 * Collects every issue with one {@link TransformPawnBody} record. An empty
 * result means the record is valid. Total over the malformed-input space
 * (issues, never crashes).
 */
export function transformPawnBodyIssues(pawn: TransformPawnBody): string[] {
  const issues: string[] = [];

  if (!isPlainObject(pawn) || !isPlainObject(pawn?.role) || !isPlainObject(pawn?.agentBody)) {
    return ["a transform pawn body must carry a role contract and an agent body"];
  }
  const { role, agentBody } = pawn;

  // Layer 1: frozen required-field completeness (@mos/contracts authority).
  try {
    assertRequiredFields(agentBody, "AgentBody");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    return issues;
  }

  // Layer 2: pawn-specific coherence.
  if (!TRANSFORM_PAWN_KINDS.includes(role.pawnKind)) {
    issues.push(`role.pawnKind must be one of the ten §9 pawn kinds (got ${String(role.pawnKind)})`);
  }
  const servedKinds = nonBlankStringArray(role.servedTransformKinds);
  if (servedKinds === undefined || servedKinds.length === 0) {
    issues.push("role.servedTransformKinds must be a non-empty array of transform kinds");
  } else {
    for (const kind of servedKinds) {
      if (!PAWN_TRANSFORM_KINDS.includes(kind as (typeof PAWN_TRANSFORM_KINDS)[number])) {
        issues.push(`served transform kind ${kind} is not one of the thirteen frozen §5 kinds`);
      }
    }
  }
  const servedCapabilities = nonBlankStringArray(role.servedCapabilities);
  if (servedCapabilities === undefined || servedCapabilities.length === 0) {
    issues.push("role.servedCapabilities must be a non-empty array of capability ids");
  }
  if (role.modelFlavor !== "deterministic" && role.modelFlavor !== "llm-flavored") {
    issues.push("role.modelFlavor must be 'deterministic' or 'llm-flavored'");
  }
  if (!Array.isArray(role.engineTools)) {
    issues.push("role.engineTools must be an array of engine tool bindings");
  } else {
    for (const binding of role.engineTools) {
      validateEngineToolBinding(binding, issues);
    }
  }

  // Agent-body / role agreement (both layers are valid enough to compare).
  if (servedCapabilities !== undefined && nonBlankStringArray(agentBody.capabilities) !== undefined) {
    const bodyCapabilities = [...(agentBody.capabilities as readonly string[])]
      .map((id) => id as string)
      .sort();
    const roleCapabilities = [...servedCapabilities].sort();
    if (bodyCapabilities.join("\u0000") !== roleCapabilities.join("\u0000")) {
      issues.push(
        "agentBody.capabilities must equal role.servedCapabilities (the body contract and the role contract describe one pawn)",
      );
    }
  }
  if (Array.isArray(role.engineTools) && servedCapabilities !== undefined) {
    const bodyTools = nonBlankStringArray(agentBody.tools) ?? [];
    for (const binding of role.engineTools as readonly PawnEngineToolBinding[]) {
      if (
        isPlainObject(binding) &&
        isNonBlankString(binding.capabilityId) &&
        !servedCapabilities.includes(binding.capabilityId as string)
      ) {
        issues.push(
          `engine tool capability ${binding.capabilityId as string} is not among the served capabilities`,
        );
      }
      if (isPlainObject(binding) && isNonBlankString(binding.capabilityId)) {
        const derived = engineToolRef(binding);
        if (!bodyTools.includes(derived as string)) {
          issues.push(
            `agentBody.tools must include the derived engine tool ref ${derived as string}`,
          );
        }
      }
    }
  }

  return issues;
}

/**
 * Validates one pawn body; throws {@link PawnExecutionError} naming every
 * issue when invalid.
 */
export function assertValidTransformPawnBody(pawn: TransformPawnBody): void {
  const issues = transformPawnBodyIssues(pawn);
  if (issues.length > 0) {
    throw new PawnExecutionError("invalid-pawn-body", issues.join("; "));
  }
}

/** Finds the pawn kind of a body record for index keys. */
export function pawnKindOf(pawn: TransformPawnBody): TransformPawnKind {
  return pawn.role.pawnKind;
}

/** The served-capability set of a pawn (for requirement matching). */
export function servedCapabilitySet(pawn: TransformPawnBody): ReadonlySet<string> {
  return new Set((pawn.role.servedCapabilities as readonly string[]).map((id) => id as string));
}

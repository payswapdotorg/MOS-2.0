/**
 * AgentBody semantic validation (AGT-001).
 *
 * Two layers, both fail-closed:
 * 1. Required-field completeness — delegated to @mos/contracts
 *    `assertRequiredFields(body, "AgentBody")`, which validates against the
 *    frozen YAML manifest (`spec/contracts/core-contracts-v2.0.yaml`), the
 *    single authority for the AgentBody required-field list.
 * 2. Semantic validation (this module): identifiers, versions, structured
 *    sub-policies, budget/latency sanity, the safety policy, and capability
 *    reference resolution through an injected {@link CapabilityRefSource}.
 *
 * Bodies never pin concrete models or runtimes — that is the AGT-002 model
 * boundary in @mos/agent-runtime (architecture lock rule 9).
 */

import { assertRequiredFields } from "@mos/contracts";
import type { AgentBody, CapabilityId } from "@mos/contracts";

import type { CapabilityRefSource } from "../ports/capability-ref-source.port.js";
import { InvalidAgentBodyError } from "../errors.js";

const MEMORY_SCOPES = new Set(["none", "session", "persistent"]);

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the string items when `value` is an array of non-blank strings. */
function nonBlankStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: string[] = [];
  for (const item of value) {
    if (!isNonBlankString(item)) {
      return undefined;
    }
    items.push(item);
  }
  return items;
}

function validateMoney(path: string, value: unknown, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object with amount and currency`);
    return;
  }
  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0) {
    issues.push(`${path}.amount must be a finite number >= 0`);
  }
  if (!isNonBlankString(value.currency)) {
    issues.push(`${path}.currency must be a non-blank ISO-4217 code`);
  }
}

/**
 * Collects every semantic issue with one {@link AgentBody} record. An empty
 * result means the record is valid. Pure function — no registry access, no
 * mutation. Malformed input (null sub-objects, wrong types) is reported as
 * issues rather than crashing: the required-field layer only rejects
 * `undefined` fields, so this layer must be total over the remaining space.
 */
export function agentBodyIssues(
  body: AgentBody,
  capabilitySource?: CapabilityRefSource,
): string[] {
  const issues: string[] = [];

  // Layer 1: frozen required-field completeness (@mos/contracts authority).
  try {
    assertRequiredFields(body, "AgentBody");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    return issues;
  }

  // Layer 2: semantics. All required fields are present here; validate shapes.
  if (!isNonBlankString(body.id)) {
    issues.push("id must be a non-blank string");
  }
  if (!Number.isInteger(body.version) || (body.version as number) < 1) {
    issues.push("version must be an integer >= 1");
  }

  if (!isPlainObject(body.roleContract)) {
    issues.push("roleContract must be an object with summary and duties");
  } else {
    if (!isNonBlankString(body.roleContract.summary)) {
      issues.push("roleContract.summary must be a non-blank string");
    }
    const duties = nonBlankStringArray(body.roleContract.duties);
    if (duties === undefined) {
      issues.push("roleContract.duties must be an array of non-blank strings");
    } else if (duties.length === 0) {
      issues.push("roleContract.duties must declare at least one duty");
    }
  }

  for (const path of ["inputContract", "outputContract", "actionInterface"] as const) {
    const schema = body[path] as unknown;
    if (!isPlainObject(schema) || Object.keys(schema).length === 0) {
      issues.push(`${path} must be a non-empty schema object`);
    }
  }

  if (nonBlankStringArray(body.tools) === undefined) {
    issues.push("tools must be an array of non-blank tool refs");
  }
  if (nonBlankStringArray(body.permissions) === undefined) {
    issues.push("permissions must be an array of non-blank permission refs");
  }

  if (!isPlainObject(body.memory) || !MEMORY_SCOPES.has(body.memory.scope as string)) {
    issues.push("memory.scope must be one of none | session | persistent");
  }

  if (!isPlainObject(body.communication)) {
    issues.push("communication must be an object with mayInitiate and allowedTopics");
  } else {
    if (typeof body.communication.mayInitiate !== "boolean") {
      issues.push("communication.mayInitiate must be a boolean");
    }
    if (nonBlankStringArray(body.communication.allowedTopics) === undefined) {
      issues.push("communication.allowedTopics must be an array of non-blank topics");
    }
  }

  const capabilities = nonBlankStringArray(body.capabilities);
  if (capabilities === undefined) {
    issues.push("capabilities must be an array of non-blank capability ids");
  } else if (capabilitySource !== undefined) {
    // Capability ref validation: every declared capability id must resolve
    // against the capability authority (fail-closed unknown refs).
    for (const capabilityId of capabilities) {
      if (capabilitySource.getLatest(capabilityId as CapabilityId) === undefined) {
        issues.push(
          `capabilities references unknown capability: ${capabilityId} (register the capability before the body)`,
        );
      }
    }
  }

  if (isPlainObject(body.budget)) {
    validateMoney("budget.maxCost", body.budget.maxCost, issues);
    if (
      typeof body.budget.maxDurationMs !== "number" ||
      !Number.isFinite(body.budget.maxDurationMs) ||
      body.budget.maxDurationMs < 0
    ) {
      issues.push("budget.maxDurationMs must be a finite number >= 0");
    }
  } else {
    issues.push("budget must be an object with maxCost and maxDurationMs");
  }

  if (isPlainObject(body.latency)) {
    const p50 = body.latency.p50Ms;
    const p95 = body.latency.p95Ms;
    const p99 = body.latency.p99Ms;
    if (
      typeof p50 !== "number" || !Number.isFinite(p50) || p50 < 0 ||
      typeof p95 !== "number" || !Number.isFinite(p95) || p95 < 0 ||
      typeof p99 !== "number" || !Number.isFinite(p99) || p99 < 0
    ) {
      issues.push("latency percentiles must be finite numbers >= 0");
    } else if (p50 > p95 || p95 > p99) {
      issues.push("latency percentiles must satisfy p50Ms <= p95Ms <= p99Ms");
    }
  } else {
    issues.push("latency must be an object with p50Ms, p95Ms and p99Ms");
  }

  if (!isNonBlankString(body.evaluator)) {
    issues.push("evaluator must be a non-blank evaluator ref");
  }

  const safety = body.safety as unknown;
  const prohibitions = isPlainObject(safety)
    ? nonBlankStringArray(safety.prohibitions)
    : undefined;
  if (prohibitions === undefined) {
    issues.push("safety.prohibitions must be an array of non-blank prohibitions");
  } else if (prohibitions.length === 0) {
    issues.push(
      "safety.prohibitions must declare at least one prohibition (AGENTS.md Safety list is the vocabulary)",
    );
  }

  return issues;
}

/**
 * Validates one {@link AgentBody} record against the frozen contract and the
 * injected capability source. Throws {@link InvalidAgentBodyError} naming
 * every issue when the record is invalid; returns silently when valid.
 */
export function assertValidAgentBody(
  body: AgentBody,
  capabilitySource?: CapabilityRefSource,
): void {
  const issues = agentBodyIssues(body, capabilitySource);
  if (issues.length > 0) {
    throw new InvalidAgentBodyError(issues.join("; "));
  }
}

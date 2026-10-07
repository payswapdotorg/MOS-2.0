/**
 * Composed policy stack (POLICY-001) — the disclosed testing/composition
 * seam: the in-memory registry + the in-memory evaluation adapter (the
 * REAL policy authority surfaces) + the W6-C distribution gate adapter,
 * wired together with injectable deterministic clock/id factories.
 *
 * This is a COMPOSITION SEAM, not a production composition root (the
 * W5-C/W6-C precedent): durable stores, real registry binding and the
 * real distribution-gate wiring are TL-owned later work.
 */

import type { Timestamp } from "@mos/contracts";

import type { PolicyEvaluationId, PolicyRuleId } from "../contracts/ids.js";
import type { RegisterPolicyRuleInput, PolicyRule } from "../contracts/policy-rule.js";
import type { PolicyRegistryPort } from "../ports/policy-registry.port.js";
import type { PolicyEvaluationPort } from "../ports/policy-evaluation.port.js";
import { createInMemoryPolicyRegistry } from "../adapters/in-memory-policy-registry.js";
import { createInMemoryPolicyEvaluation } from "../adapters/in-memory-policy-evaluation.js";
import type {
  DistributionPolicyGate,
  DistributionPolicyGateOptions,
} from "./distribution-policy-gate.js";
import { createDistributionPolicyGate } from "./distribution-policy-gate.js";

/** Options for {@link composePolicyStack}. */
export interface ComposePolicyStackOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Injectable §30 evaluation-id factory (deterministic tests). */
  readonly nextEvaluationId?: () => PolicyEvaluationId;
  /** Overrides the distribution gate's default policy resolution. */
  readonly resolveDistributionPolicy?: DistributionPolicyGateOptions["resolvePolicy"];
}

/** The composed policy stack (registry + evaluation + the W6-C seam gate). */
export interface ComposedPolicyStack {
  /** The rule registry (the REAL registry surface). */
  readonly registry: PolicyRegistryPort;
  /** The evaluation surface (the REAL evaluation port). */
  readonly evaluation: PolicyEvaluationPort;
  /** Registers one rule (v1 — the seam's seeding path). */
  registerRule(input: RegisterPolicyRuleInput): PolicyRule;
  /** Revises one rule (appends v+1 — the seam's revision path). */
  reviseRule(input: RegisterPolicyRuleInput): PolicyRule;
  /** The W6-C distribution PolicyGatePort seam adapter over this stack. */
  readonly distributionGate: DistributionPolicyGate;
}

/** Deterministic evaluation-id factory for tests (`policy-evaluation-<n>`). */
export function sequencedEvaluationIds(prefix = "policy-evaluation"): () => PolicyEvaluationId {
  let counter = 0;
  return () => {
    counter += 1;
    return `policy-evaluation:${prefix}-${counter}` as PolicyEvaluationId;
  };
}

/** Deterministic registration clock for tests (fixed instant). */
export function fixedClock(instant = "2026-01-01T00:00:00.000Z"): () => Timestamp {
  return () => instant as Timestamp;
}

/**
 * Composes the policy stack. The fictional rule ids minted through this
 * seam are DATA (e.g. `policy:tenant-alpha-distribution`); no real
 * tenant or rule is implied.
 */
export function composePolicyStack(
  options: ComposePolicyStackOptions = {},
): ComposedPolicyStack {
  const registry = createInMemoryPolicyRegistry({ now: options.now });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: options.now,
    nextId: options.nextEvaluationId,
  });
  const distributionGate = createDistributionPolicyGate({
    registry,
    evaluation,
    resolvePolicy: options.resolveDistributionPolicy,
  });

  return {
    registry,
    evaluation,
    registerRule: (input) => registry.register(input),
    reviseRule: (input) => registry.revise(input),
    distributionGate,
  };
}

/** Convenience: a rule-id helper for composition-seam data. */
export function ruleId(value: string): PolicyRuleId {
  return value as PolicyRuleId;
}

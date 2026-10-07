/**
 * REAL-pipeline integration test (POLICY-001) — the RUNTIME half of the
 * W6-C seam compatibility pins.
 *
 * Proves the policy authority satisfies the distribution PolicyGatePort
 * seam END-TO-END: the REAL distribution pipeline
 * (channel resolution → rights gate → POLICY GATE → capability matrix →
 * transport) runs with THIS package's gate adapter wired in place of the
 * W6-C disclosed double (the compile-time half lives in
 * compat/distribution-policy-gate-compat.ts). The REAL sibling packages
 * are imported by relative dist path (the W7-B compat precedent — no
 * runtime dependency of this package is created).
 *
 * Pins (per the W6-C fail-closed contract):
 * - a permitting policy rule (registered through THIS authority) lets a
 *   REAL publish flow to the transport, and the §30 distribution record
 *   cites the canonical PolicyRef of the allowing rule;
 * - a deny-effect rule denies the publish with `policy-gate-denied`,
 *   the authority's attribution detail VERBATIM in the failure details,
 *   and the transport is NEVER reached (send-counting pin);
 * - a constraint-driven denial (modality restriction vs the fixture
 *   video artifact) names the rule AND the constraint end-to-end;
 * - an approval-required rule denies naming the approver role (the seam
 *   has no pending state — documented mapping);
 * - NO registered distribution rules → `insufficient-policy` denial
 *   (FAIL CLOSED — never a silent allow; the fail-closed twin of the
 *   W6-C double's `no-matching-policy`);
 * - the evaluation audit log of THIS authority records every verdict the
 *   gate produced (append-only, tenant-scoped).
 *
 * All provider data is FICTIONAL (the distribution fixtures' aurora
 * social — disclosed data seams, never provider claims).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// REAL sibling packages (relative dist paths — the same public surfaces
// the bare specifiers resolve to after `tsc -b`; no runtime dependency
// of this package is created).
import {
  createInMemoryMerchantClientInstanceRegistry,
  createInMemoryProviderDefinitionRegistry,
  createInMemoryProviderImplementationRegistry,
  createInMemoryProviderSecretStore,
} from "../../mos-integrations/dist/index.js";
import {
  createInMemorySocialAdapter,
  createInMemorySocialChannelRegistry,
  createInMemorySocialRightsGate,
} from "../../mos-distribution/dist/index.js";
import { createInMemorySocialTransportDouble } from "../../mos-distribution/dist/adapters/in-memory-social-transport.js";
import { createCountingTransport } from "../../mos-distribution/dist/testing/counting-transport.js";
import {
  ACTOR_ONE,
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  EVIDENCE_HEALTH_CHECK,
  FIXTURE_ARTIFACT,
  FULLY_SUPPORTED_MATRIX,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  STANDARD_TRANSPORT_ROUTES,
  channelInput,
  socialRightsGrantFixture,
} from "../../mos-distribution/dist/testing/fixtures.js";
import { evaluateRights } from "../../mos-rights/dist/index.js";
import type { RightsContextRef } from "../../mos-integrations/dist/index.js";
import type { SocialAdapterPort } from "../../mos-distribution/dist/index.js";
import type { SocialChannelId } from "../../mos-distribution/dist/contracts/ids.js";
import type { CountingTransport } from "../../mos-distribution/dist/testing/counting-transport.js";

// THIS package's composition seam (built).
import { composePolicyStack } from "../dist/testing/compose-policy-stack.js";
import type { ComposedPolicyStack } from "../dist/testing/compose-policy-stack.js";
import type { RegisterPolicyRuleInput } from "../dist/index.js";

const NOW = (): string => "2026-06-01T00:00:00.000Z";

/** The standard fictional distribution arrangement with MY policy gate wired. */
interface RealPipelineArrangement {
  readonly policy: ComposedPolicyStack;
  /** The REAL distribution adapter with the policy authority's gate. */
  readonly adapter: SocialAdapterPort;
  readonly transport: CountingTransport;
  readonly rightsContextRef: RightsContextRef;
  readonly channelId: SocialChannelId;
}

/** Composes the REAL pipeline with the policy authority's gate (mirrors composeDistributionStack). */
function composeRealPipelineWithPolicyGate(): RealPipelineArrangement {
  const policy = composePolicyStack({ now: NOW });

  const definitions = createInMemoryProviderDefinitionRegistry();
  const implementations = createInMemoryProviderImplementationRegistry({ definitions, now: NOW });
  const secrets = createInMemoryProviderSecretStore({ now: NOW });
  const instances = createInMemoryMerchantClientInstanceRegistry({ implementations, secrets, now: NOW });
  const channels = createInMemorySocialChannelRegistry({ instances, now: NOW });
  const rightsGate = createInMemorySocialRightsGate({ evaluate: evaluateRights, now: NOW });
  const transport = createCountingTransport(
    createInMemorySocialTransportDouble({ routes: STANDARD_TRANSPORT_ROUTES }),
  );
  const adapter = createInMemorySocialAdapter({
    channels,
    rightsGate,
    policyGate: policy.distributionGate,
    transport,
    now: NOW,
  });

  const definition = definitions.register(AURORA_DEFINITION_INPUT);
  const implementation = implementations.register({
    scope: SCOPE_ALPHA,
    definitionId: definition.id,
    definitionVersion: definition.version,
    label: "primary",
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
    evidenceModel: { shape: "provider-evidence-v1" },
    errorModel: { shape: "provider-errors-v1" },
    rateLimitObservation: {
      observedAt: "2026-01-01T00:00:00.000Z" as never,
      requestsPerWindow: 600,
      windowMs: 600_000,
    },
  });
  const credentialRef = secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "aurora oauth2 escrow (fictional)",
    kind: "oauth2-refresh-token",
  });
  const instance = instances.register({
    scope: SCOPE_ALPHA,
    name: "aurora-main",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
  });
  const channel = channels.register(
    channelInput(instance.id, FULLY_SUPPORTED_MATRIX, {
      externalAccount: AURORA_EXTERNAL_ACCOUNT,
    }),
  );
  const rightsContextRef = rightsGate.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:compat-distribution",
        tenantId: SCOPE_ALPHA.tenantId,
        grantee: ACTOR_ONE,
        actions: ["distribute", "analyze"],
        subjectRefs: [
          `artifact:${FIXTURE_ARTIFACT.artifactId as string}`,
          AURORA_EXTERNAL_ACCOUNT as string,
        ],
      }),
    ],
  });

  return { policy, adapter, transport, rightsContextRef, channelId: channel.id };
}

/** A standard publish request through the REAL pipeline (fictional data). */
function publishRequest(arrangement: RealPipelineArrangement) {
  return {
    scope: SCOPE_ALPHA,
    channelRef: arrangement.channelId,
    actor: ACTOR_ONE,
    rightsContextRef: arrangement.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "artifact-with-caption" as const, caption: "compat caption (fictional)" },
  };
}

/** Registers one distribution-scoped rule into the policy authority. */
function registerRule(policy: ComposedPolicyStack, input: RegisterPolicyRuleInput): void {
  policy.registerRule(input);
}

const DISTRIBUTION_RULE_BASE = {
  scope: SCOPE_ALPHA,
  declaredScope: {
    actionKinds: ["distribution"] as const,
    subjectRefs: [] as never[],
    actorRefs: [] as never[],
  },
  createdByAuthority: "tenant-admin",
  createdBy: "identity:policy-admin" as never,
};

test("the policy authority PERMITS a real publish through the REAL distribution pipeline", () => {
  const arrangement = composeRealPipelineWithPolicyGate();
  registerRule(arrangement.policy, {
    ...DISTRIBUTION_RULE_BASE,
    id: "policy:compat-allow-distribution" as never,
    constraints: [],
    effect: "allow",
    rationale: "distribution of approved artifacts is permitted (fixture rule)",
  });

  const outcome = arrangement.adapter.publish(publishRequest(arrangement));

  assert.equal(outcome.outcome, "completed");
  assert.ok(arrangement.transport.sentCount() >= 1, "the permitting verdict reached the transport");
  assert.equal(
    outcome.record.policyRef,
    "policy:compat-allow-distribution" as never,
    "the §30 distribution record cites the canonical PolicyRef of the allowing rule",
  );
  // The authority's own audit log recorded the permitting evaluation.
  const log = arrangement.policy.evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 1);
  assert.equal(log[0]?.verdict.outcome, "allowed");
});

test("a deny-effect rule DENIES the real publish — transport never reached, reason verbatim", () => {
  const arrangement = composeRealPipelineWithPolicyGate();
  registerRule(arrangement.policy, {
    ...DISTRIBUTION_RULE_BASE,
    id: "policy:compat-deny-distribution" as never,
    constraints: [],
    effect: "deny",
    rationale: "a fixture prohibition (fictional tenant rule)",
  });

  const outcome = arrangement.adapter.publish(publishRequest(arrangement));

  assert.equal(outcome.outcome, "failed");
  assert.equal(arrangement.transport.sentCount(), 0, "a denial NEVER reaches the transport");
  assert.equal(outcome.failure.code, "policy-gate-denied");
  const reason = (outcome.failure.details as { denialReason?: string }).denialReason ?? "";
  assert.match(reason, /policy-denied: denied by the deny-effect rule policy:compat-deny-distribution@v1/);
  // DISCLOSED (the REAL W6-C pipeline's recorded behavior): the §30
  // distribution record carries policyRef null on the policy-gate-denied
  // path — the record's policyRef cites PERMITTING rules; the denial
  // attribution rides verbatim in failure.details.denialReason (asserted
  // above) and in THIS authority's own audit log.
  assert.equal(outcome.record.policyRef, null);
  // ...and THIS authority's own audit log recorded the full denial
  // attribution (named rule + effect + rationale).
  const log = arrangement.policy.evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 1);
  const verdict = log[0]?.verdict;
  assert.equal(verdict?.outcome, "denied");
  if (verdict?.outcome === "denied") {
    assert.equal(verdict.deniedBy.deniedByEffect, true);
    assert.equal(verdict.deniedBy.rule.id, "policy:compat-deny-distribution");
    assert.equal(verdict.deniedBy.rationale, "a fixture prohibition (fictional tenant rule)");
  }
});

test("a CONSTRAINT-driven denial names the rule AND the constraint end-to-end", () => {
  const arrangement = composeRealPipelineWithPolicyGate();
  // The fixture artifact is a video/mp4 artifact — the gate derives
  // modality ["video"] from the DECLARED type (documented coarse
  // mapping), so a text-only modality restriction denies it.
  registerRule(arrangement.policy, {
    ...DISTRIBUTION_RULE_BASE,
    id: "policy:compat-text-only" as never,
    constraints: [{ kind: "modality-restriction", allowedModalities: ["text"] }],
    effect: "allow",
    rationale: "text-only distribution window (fixture rule)",
  });

  const outcome = arrangement.adapter.publish(publishRequest(arrangement));

  assert.equal(outcome.outcome, "failed");
  assert.equal(arrangement.transport.sentCount(), 0);
  assert.equal(outcome.failure.code, "policy-gate-denied");
  const reason = (outcome.failure.details as { denialReason?: string }).denialReason ?? "";
  assert.match(reason, /policy:compat-text-only@v1 constraint modality-restriction/);
  assert.match(reason, /video/);
});

test("an approval-required rule DENIES naming the approver role (the seam has no pending state)", () => {
  const arrangement = composeRealPipelineWithPolicyGate();
  registerRule(arrangement.policy, {
    ...DISTRIBUTION_RULE_BASE,
    id: "policy:compat-approval" as never,
    constraints: [],
    effect: "require-approval",
    approverRole: "distribution-approver",
    rationale: "distribution requires human sign-off (fixture rule)",
  });

  const outcome = arrangement.adapter.publish(publishRequest(arrangement));

  assert.equal(outcome.outcome, "failed");
  assert.equal(arrangement.transport.sentCount(), 0);
  const reason = (outcome.failure.details as { denialReason?: string }).denialReason ?? "";
  assert.match(reason, /approval-required: distribution-approver must approve/);
  assert.match(reason, /policy:compat-approval@v/);
});

test("NO registered distribution rules → insufficient-policy DENIAL (fail closed, never silent allow)", () => {
  const arrangement = composeRealPipelineWithPolicyGate();

  const outcome = arrangement.adapter.publish(publishRequest(arrangement));

  assert.equal(outcome.outcome, "failed");
  assert.equal(arrangement.transport.sentCount(), 0);
  const reason = (outcome.failure.details as { denialReason?: string }).denialReason ?? "";
  assert.equal(reason, "insufficient-policy");
  assert.equal(outcome.record.policyRef, null);
});

test("a rule scoped to a DIFFERENT action kind does not govern the distribution seam", () => {
  const arrangement = composeRealPipelineWithPolicyGate();
  registerRule(arrangement.policy, {
    ...DISTRIBUTION_RULE_BASE,
    id: "policy:compat-engine-only" as never,
    declaredScope: { actionKinds: ["engine-invocation"], subjectRefs: [], actorRefs: [] },
    constraints: [],
    effect: "allow",
    rationale: "an engine-invocation rule that must not govern distribution",
  });

  const outcome = arrangement.adapter.publish(publishRequest(arrangement));

  // The engine rule is not consulted by the distribution gate's default
  // resolution (latest rules governing `distribution`) → insufficient
  // policy → fail closed.
  assert.equal(outcome.outcome, "failed");
  assert.equal(arrangement.transport.sentCount(), 0);
  const reason = (outcome.failure.details as { denialReason?: string }).denialReason ?? "";
  assert.equal(reason, "insufficient-policy");
});

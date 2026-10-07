/**
 * Social adapter pipeline (SOCIAL-001) — the five-stage gate machinery of
 * the call surface, extracted from the adapter runtime for file-budget
 * reasons (behavior unchanged; the split is mechanical).
 *
 * Stages (each failure is typed, §30-recorded where attributable, terminal):
 * 1. resolve the channel IN THE CALLER'S TENANT — cross-tenant ≡ unknown
 *    (§31 no existence leaks; an unresolvable channel yields the
 *    `unresolved-channel` outcome with NO audit record: nothing was
 *    attributable — disclosed, the W5-C precedent);
 * 2. RIGHTS GATE on the presented RightsContextRef (fail-closed: denied
 *    interactions never reach the policy gate, the capability matrix or
 *    the transport — the backlog's "rights/policy gates precede provider
 *    calls" acceptance; @mos/rights denial reasons surface VERBATIM);
 * 3. POLICY GATE through the declared seam (fail-closed: no matching
 *    policy rule is a denial, never a permissive default);
 * 4. CAPABILITY MATRIX — the channel's declared surface is the whole
 *    surface: undeclared operation → typed refusal; declared unsupported
 *    → typed refusal; declared UNKNOWN → its OWN typed outcome, recorded
 *    VERBATIM (never coerced to unsupported); parity is never assumed;
 * 5. TRANSPORT seam call — its response self-labels the source, and the
 *    platform-said payload is TYPED fail-closed (never invented: a
 *    response missing the refs/timestamps an operation requires is a
 *    typed invalid-platform-response failure).
 *
 * Internal machinery (not exported from the package index).
 */

import type {
  IdentityRef,
  JsonObject,
  Milliseconds,
  PolicyRef,
  Timestamp,
} from "@mos/contracts";
import type { CapabilitySupportLevel, RightsContextRef } from "@mos/integrations";

import type {
  DeclaredSocialPresentation,
  SocialOperation,
  SocialOperationRequest,
} from "../contracts/social-operation.js";
import { SOCIAL_OPERATION_RIGHTS_ACTIONS } from "../contracts/social-operation.js";
import type {
  SocialAdapterOutcome,
  SocialDistributionFailure,
  SocialDistributionRecord,
} from "../contracts/distribution-record.js";
import type { SocialChannel } from "../contracts/social-channel.js";
import type { SocialDistributionId } from "../contracts/ids.js";
import type { ArtifactRef } from "@mos/content";
import type { SocialChannelRegistryPort } from "../ports/social-channel-registry.port.js";
import type { SocialPolicyGatePort } from "../ports/social-policy-gate.port.js";
import type { SocialRightsGatePort } from "../ports/social-rights-gate.port.js";
import type { SocialTransportPort } from "../ports/social-transport.port.js";
import type { SocialRecordLogStore } from "./social-record-logs.js";
import type { PlatformRecordContext } from "./platform-response.js";
import { assertVocabularyMember, deepFreeze, defaultNow } from "./registry-support.js";
import { RIGHTS_ACTIONS } from "./social-request-validation.js";

/** The gate-context the transport continuation receives. */
export interface PipelineContext {
  readonly id: SocialDistributionId;
  readonly channel: SocialChannel;
  readonly startedAt: string;
  /** The capability-matrix declaration that governed the operation (stage 4). */
  readonly operationSupport: CapabilitySupportLevel;
  /** The policy the PERMIT verdict cited (stage 3). */
  readonly policyRef: PolicyRef | null;
}

/** What a platform-output typer receives (all from the §30 attempt). */
export interface PlatformTypingArgs {
  readonly output: JsonObject;
  readonly recordedAt: string;
  /** The transport's honest source label (carried on every typed record). */
  readonly source: string;
}

export type PlatformTypingResult<TOutput> =
  | { readonly ok: true; readonly value: TOutput; append(): void }
  | { readonly ok: false; readonly failure: SocialDistributionFailure };

/** The dependencies the pipeline runs over (the adapter runtime wires them). */
export interface SocialPipelineDeps {
  readonly channels: SocialChannelRegistryPort;
  readonly rightsGate: SocialRightsGatePort;
  readonly policyGate: SocialPolicyGatePort;
  readonly transport: SocialTransportPort;
  readonly logs: SocialRecordLogStore;
  readonly now: () => string;
  /** §30 request-id factory (deterministic tests inject their own). */
  readonly nextId: () => SocialDistributionId;
}

/** The pipeline surface the adapter runtime drives. Internal helper. */
export interface SocialPipeline {
  /** Stages 1–4 (channel resolution + the three gates). */
  run<TOutput>(
    request: SocialOperationRequest,
    operation: SocialOperation,
    subjectOf: (channel: SocialChannel) => string,
    policyContext: {
      readonly artifact?: ArtifactRef;
      readonly presentation?: DeclaredSocialPresentation;
    },
    proceed: (context: PipelineContext) => SocialAdapterOutcome<TOutput>,
  ): SocialAdapterOutcome<TOutput>;

  /** Stage 5 — transport + platform-said typing + record appending. */
  transportStage<TOutput>(
    context: PipelineContext,
    request: SocialOperationRequest,
    operation: SocialOperation,
    parameters: JsonObject,
    typeOutput: (args: PlatformTypingArgs) => PlatformTypingResult<TOutput>,
  ): SocialAdapterOutcome<TOutput>;

  /** The platform-record context shared by every output typer. */
  platformContext(context: PipelineContext, args: PlatformTypingArgs): PlatformRecordContext;
}

/** Creates the five-stage pipeline over the wired dependencies. */
export function createSocialPipeline(deps: SocialPipelineDeps): SocialPipeline {
  const now = deps.now ?? defaultNow;

  function buildRecord(
    base: {
      readonly id: SocialDistributionId;
      readonly channel: SocialChannel;
      readonly operation: SocialOperation;
      readonly actor: IdentityRef;
      readonly rightsContextRef: RightsContextRef;
      readonly startedAt: string;
    },
    operationSupport: CapabilitySupportLevel | null,
    policyRef: PolicyRef | null,
    failure: SocialDistributionFailure | null,
    warnings: SocialDistributionRecord["warnings"],
    transportSource: string,
  ): SocialDistributionRecord {
    const completedAt = now();
    const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(base.startedAt));
    return deepFreeze({
      id: base.id,
      scope: base.channel.scope,
      channelRef: base.channel.id,
      providerId: base.channel.providerId,
      operation: base.operation,
      operationSupport,
      actor: base.actor,
      rightsContextRef: base.rightsContextRef,
      policyRef,
      startedAt: base.startedAt as Timestamp,
      durationMs: durationMs as Milliseconds,
      failure,
      warnings,
      transportSource,
    });
  }

  function pipeline<TOutput>(
    request: SocialOperationRequest,
    operation: SocialOperation,
    subjectOf: (channel: SocialChannel) => string,
    policyContext: {
      readonly artifact?: ArtifactRef;
      readonly presentation?: DeclaredSocialPresentation;
    },
    proceed: (context: PipelineContext) => SocialAdapterOutcome<TOutput>,
  ): SocialAdapterOutcome<TOutput> {
    // Stage 1 — channel resolution IN THE CALLER'S TENANT. Cross-tenant
    // is indistinguishable from nonexistent (§31); an unresolvable
    // channel yields the unresolved-channel outcome with NO audit record
    // (nothing was attributable — disclosed).
    const channel = deps.channels.getLatest(request.scope.tenantId, request.channelRef);
    if (channel === undefined) {
      return {
        outcome: "unresolved-channel",
        failure: {
          code: "unknown-social-channel",
          message: "social channel is not registered in this tenant",
          retriable: false,
        },
      };
    }

    const base = {
      id: deps.nextId(),
      channel,
      operation,
      actor: request.actor,
      rightsContextRef: request.rightsContextRef,
      startedAt: now(),
    };

    // Stage 2 — RIGHTS GATE precedes the provider call (fail-closed).
    // The §30 actor is the rights GRANTEE; the subject derives from the
    // operation (artifact vs channel — documented derivations).
    const action = SOCIAL_OPERATION_RIGHTS_ACTIONS[operation];
    assertVocabularyMember(action, RIGHTS_ACTIONS, "rightsAction", "social-request");
    const verdict = deps.rightsGate.check({
      scope: request.scope,
      rightsContextRef: request.rightsContextRef,
      grantee: request.actor,
      action,
      subjectRef: subjectOf(channel),
    });
    if (!verdict.allowed) {
      const failure: SocialDistributionFailure = {
        code: "rights-gate-denied",
        message: `rights gate denied the operation (${verdict.denialReason})`,
        retriable: false,
        details: { denialReason: verdict.denialReason },
      };
      const record = buildRecord(base, null, null, failure, [], "rights-gate");
      deps.logs.appendDistributionRecord(record);
      return { outcome: "failed", record, failure };
    }

    // Stage 3 — POLICY GATE through the declared seam (fail-closed: no
    // matching policy rule is a denial, never a permissive default).
    const policyVerdict = deps.policyGate.check({
      scope: request.scope,
      actor: request.actor,
      operation,
      subjectRef: subjectOf(channel),
      ...(policyContext.artifact !== undefined ? { artifact: policyContext.artifact } : {}),
      ...(policyContext.presentation !== undefined ? { presentation: policyContext.presentation } : {}),
    });
    if (policyVerdict.decision === "denied") {
      const failure: SocialDistributionFailure = {
        code: "policy-gate-denied",
        message: `policy gate denied the operation (${policyVerdict.denialReason})`,
        retriable: false,
        details: { denialReason: policyVerdict.denialReason },
      };
      const record = buildRecord(base, null, null, failure, [], "policy-gate");
      deps.logs.appendDistributionRecord(record);
      return { outcome: "failed", record, failure };
    }

    // Stage 4 — CAPABILITY MATRIX: the declared surface is the whole
    // surface (parity is never assumed). Undeclared → typed refusal;
    // unsupported → typed refusal; UNKNOWN → its OWN preserved outcome.
    const declaration = channel.capabilityMatrix.find((entry) => entry.operation === operation);
    if (declaration === undefined) {
      const failure: SocialDistributionFailure = {
        code: "operation-not-declared",
        message:
          "the channel's capability matrix declares no entry for this operation — parity is never assumed (the declared surface is the whole surface)",
        retriable: false,
        details: { operation },
      };
      const record = buildRecord(base, null, policyVerdict.policyRef, failure, [], "capability-matrix");
      deps.logs.appendDistributionRecord(record);
      return { outcome: "failed", record, failure };
    }
    if (declaration.support === "unsupported" || declaration.support === "unknown") {
      const failure: SocialDistributionFailure = {
        code: declaration.support === "unsupported" ? "operation-unsupported" : "operation-support-unknown",
        message: `the channel's capability matrix declares this operation "${declaration.support}"`,
        retriable: false,
        details: { operation, declaredSupport: declaration.support },
      };
      const record = buildRecord(base, declaration.support, policyVerdict.policyRef, failure, [], "capability-matrix");
      deps.logs.appendDistributionRecord(record);
      return { outcome: "failed", record, failure };
    }

    return proceed({
      id: base.id,
      channel,
      startedAt: base.startedAt,
      operationSupport: declaration.support,
      policyRef: policyVerdict.policyRef,
    });
  }

  function transportStage<TOutput>(
    context: PipelineContext,
    request: SocialOperationRequest,
    operation: SocialOperation,
    parameters: JsonObject,
    typeOutput: (args: PlatformTypingArgs) => PlatformTypingResult<TOutput>,
  ): SocialAdapterOutcome<TOutput> {
    const recordBase = {
      id: context.id,
      channel: context.channel,
      operation,
      actor: request.actor,
      rightsContextRef: request.rightsContextRef,
      startedAt: context.startedAt,
    };
    // The artifact travels as its REFERENCE inside the small
    // control-plane parameters (never media bytes — structurally pinned).
    const response = deps.transport.send({
      requestId: context.id,
      scope: context.channel.scope,
      providerId: context.channel.providerId,
      channelRef: context.channel.id,
      instanceRef: context.channel.instanceRef,
      operation,
      parameters,
    });
    if (!response.ok) {
      const record = buildRecord(
        recordBase,
        context.operationSupport,
        context.policyRef,
        response.failure,
        [],
        response.source,
      );
      deps.logs.appendDistributionRecord(record);
      return { outcome: "failed", record, failure: response.failure };
    }
    const typed = typeOutput({ output: response.output, recordedAt: now(), source: response.source });
    if (!typed.ok) {
      const record = buildRecord(
        recordBase,
        context.operationSupport,
        context.policyRef,
        typed.failure,
        [...response.warnings],
        response.source,
      );
      deps.logs.appendDistributionRecord(record);
      return { outcome: "failed", record, failure: typed.failure };
    }
    typed.append();
    const record = buildRecord(recordBase, context.operationSupport, context.policyRef, null, [...response.warnings], response.source);
    deps.logs.appendDistributionRecord(record);
    return { outcome: "completed", record, output: typed.value };
  }

  function platformContext(context: PipelineContext, args: PlatformTypingArgs): PlatformRecordContext {
    return {
      scope: context.channel.scope,
      channelRef: context.channel.id,
      providerId: context.channel.providerId,
      source: args.source,
      recordedAt: args.recordedAt,
    };
  }

  return { run: pipeline, transportStage, platformContext };
}

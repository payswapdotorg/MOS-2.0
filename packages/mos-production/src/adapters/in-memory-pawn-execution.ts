/**
 * In-memory pawn execution runtime (LAB-013) — the PawnExecutionPort
 * adapter over the agent-stack / engine-runner / transform-source /
 * artifact-source / rights-gate seams.
 *
 * PAWNS ARE AGENT INSTANCES: instantiation, binding and release delegate to
 * the instance-registry seam (the real @mos/agent-runtime registry at the
 * composition root); model assignment happens ONLY through the boundary the
 * registry owns (this adapter has NO model-selection surface — pinned by
 * src/no-second-runtime.test.ts); engine invocations are EngineJobs
 * submitted THROUGH the runner seam; agent execution goes through the
 * executor seam. There is no second runtime.
 *
 * The execution flow itself lives in adapters/pawn-execution-run.ts; the §30
 * record assembly + append-only history in
 * adapters/pawn-execution-recording.ts. Caller errors are thrown typed and
 * append NO record; production-action failures are RECORDED (§30).
 *
 * DISCLOSED DOUBLE: the persistence is a process-local map (durable
 * execution history is later-wave work behind the same port).
 */

import type {
  EngineJobId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import { PawnExecutionError } from "../domain/errors.js";
import { assertValidTransformPawnBody } from "../domain/pawn-body-validation.js";
import { deepFreezeRecord } from "./registry-support.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";
import type { TransformPawnTask } from "../contracts/pawn-task.js";
import type { PawnExecutionRecord } from "../contracts/pawn-execution.js";
import type { TransformPawnKind } from "../contracts/pawn-role.js";
import type { PawnAgentBodyId, PawnExecutionId, PawnInstanceId } from "../contracts/pawn-ids.js";
import type {
  InstantiatePawnInput,
  PawnExecutionPort,
} from "../ports/pawn-execution.port.js";
import type {
  PawnBodyRegistryPort,
  PawnInstanceExecutorPort,
  PawnInstanceRecord,
  PawnInstanceRegistryPort,
} from "../ports/agent-stack.ports.js";
import type { PawnEngineRunnerPort } from "../ports/engine-runner.port.js";
import type { PawnTransformSourcePort } from "../ports/transform-source.port.js";
import type { PawnArtifactSourcePort } from "../ports/artifact-source.port.js";
import type { PawnRightsGatePort } from "../ports/rights-gate.port.js";
import type { TransformPawnOrganizationRecord } from "../contracts/pawn-organization.js";
import { runPawnExecution } from "./pawn-execution-run.js";

/** Narrow organization-citation source (the real agents registry satisfies it). */
export interface PawnOrganizationSource {
  get(
    scope: TenantScope,
    organizationId: TransformPawnOrganizationRecord["id"],
    version?: Version,
  ): TransformPawnOrganizationRecord | undefined;
}

/** Options for the in-memory pawn execution runtime. */
export interface InMemoryPawnExecutionRuntimeOptions {
  readonly bodyRegistry: PawnBodyRegistryPort;
  readonly instances: PawnInstanceRegistryPort;
  readonly executor: PawnInstanceExecutorPort;
  readonly engineRunner: PawnEngineRunnerPort;
  readonly transformSource: PawnTransformSourcePort;
  readonly artifactSource: PawnArtifactSourcePort;
  readonly rightsGate: PawnRightsGatePort;
  /** Organization citation resolution (optional; citations fail closed without it). */
  readonly organizationSource?: PawnOrganizationSource;
  readonly now?: () => Timestamp;
  readonly executionIdFactory?: () => PawnExecutionId;
  readonly engineJobIdFactory?: () => EngineJobId;
}

/** The composed in-memory pawn execution runtime. */
export interface InMemoryPawnExecutionRuntime {
  /** The pawn lifecycle + execution surface (10 methods). */
  readonly execution: PawnExecutionPort;
}

/** Creates the in-memory {@link PawnExecutionPort} runtime. */
export function createInMemoryPawnExecutionRuntime(
  options: InMemoryPawnExecutionRuntimeOptions,
): InMemoryPawnExecutionRuntime {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  let nextExecutionSequence = 1;
  const executionIdFactory =
    options.executionIdFactory ?? (() => `pawn-execution-${nextExecutionSequence++}` as PawnExecutionId);
  let nextEngineJobSequence = 1;
  const engineJobIdFactory =
    options.engineJobIdFactory ?? (() => `engine-job-${nextEngineJobSequence++}` as EngineJobId);

  /** bodyId → version → registered pawn body. */
  const byBody = new Map<string, Map<number, TransformPawnBody>>();
  /** pawnKind → latest registered pawn body (registration order). */
  const byKind = new Map<TransformPawnKind, TransformPawnBody>();
  /** tenantId → append-only execution history. */
  const historyByTenant = new Map<string, PawnExecutionRecord[]>();

  function pawnOfInstance(record: PawnInstanceRecord): TransformPawnBody {
    const versions = byBody.get(record.bodyId as string);
    const pawn = versions?.get(record.bodyVersion as number);
    if (pawn === undefined) {
      throw new PawnExecutionError(
        "pawn-body-not-registered",
        `instance ${record.instanceId as string} was instantiated from body ${record.bodyId as string}@${record.bodyVersion as number}, which is not a registered transform pawn body`,
      );
    }
    return pawn;
  }

  const execution: PawnExecutionPort = {
    registerPawnBody(pawn: TransformPawnBody): void {
      assertValidTransformPawnBody(pawn);
      const bodyId = pawn.agentBody.id as string;
      const version = pawn.agentBody.version as number;
      let versions = byBody.get(bodyId);
      if (versions === undefined) {
        versions = new Map<number, TransformPawnBody>();
        byBody.set(bodyId, versions);
      }
      if (versions.has(version)) {
        throw new PawnExecutionError(
          "duplicate-pawn-body",
          `pawn body ${bodyId}@${version} is already registered`,
        );
      }
      // Registers the canonical agent body through the registry seam (typed
      // errors from the seam propagate).
      options.bodyRegistry.register(pawn.agentBody);
      // The stored pawn body is a DEEP-FROZEN snapshot (nested role and body
      // fields stay immutable — pinned by the registration tests).
      versions.set(version, deepFreezeRecord(pawn));
      byKind.set(pawn.role.pawnKind, pawn);
    },

    listPawnBodies(): readonly TransformPawnBody[] {
      const registered: TransformPawnBody[] = [];
      for (const versions of byBody.values()) {
        for (const pawn of versions.values()) {
          registered.push(pawn);
        }
      }
      return registered;
    },

    instantiatePawn(scope: TenantScope, input: InstantiatePawnInput): PawnInstanceRecord {
      const citesKind = input?.pawnKind !== undefined;
      const citesBody = input?.bodyId !== undefined;
      if (citesKind === citesBody) {
        throw new PawnExecutionError(
          "invalid-instantiation-input",
          "instantiate exactly one of pawnKind or bodyId",
        );
      }
      let bodyId: string;
      let bodyVersion: number;
      if (citesKind) {
        const pawn = byKind.get(input.pawnKind);
        if (pawn === undefined) {
          throw new PawnExecutionError(
            "unknown-pawn-kind",
            `pawn kind ${String(input.pawnKind)} has no registered pawn body`,
          );
        }
        bodyId = pawn.agentBody.id as string;
        bodyVersion = pawn.agentBody.version as number;
      } else {
        const versions = byBody.get(input.bodyId as string);
        if (versions === undefined || versions.size === 0) {
          throw new PawnExecutionError(
            "pawn-body-not-registered",
            `body ${input.bodyId as string} is not a registered transform pawn body`,
          );
        }
        bodyVersion =
          input.bodyVersion === undefined
            ? ([...versions.keys()].at(-1) as number)
            : (input.bodyVersion as number);
        if (!versions.has(bodyVersion)) {
          throw new PawnExecutionError(
            "pawn-body-not-registered",
            `body ${input.bodyId as string}@${bodyVersion} is not a registered transform pawn body`,
          );
        }
        bodyId = input.bodyId as string;
      }
      return options.instances.instantiate(scope, {
        bodyId: bodyId as PawnAgentBodyId,
        bodyVersion: bodyVersion as Version,
        toolRefs: input.toolRefs,
        capabilityRefs: input.capabilityRefs,
      });
    },

    bindPawnModel(
      scope: TenantScope,
      instanceId: PawnInstanceId,
      requestedModelRef?: Parameters<PawnInstanceRegistryPort["bind"]>[2],
    ): PawnInstanceRecord {
      const record = options.instances.get(scope, instanceId);
      if (record === undefined) {
        throw new PawnExecutionError(
          "unknown-pawn-instance",
          `Unknown pawn instance: ${instanceId as string} (not registered for this tenant)`,
        );
      }
      const pawn = pawnOfInstance(record);
      if (pawn.role.modelFlavor === "deterministic") {
        // PINNED (§9): deterministic pawns NEVER carry a model binding.
        throw new PawnExecutionError(
          "no-model-binding-for-deterministic-pawn",
          `pawn kind ${String(pawn.role.pawnKind)} is deterministic — it invokes engines through the runner and never binds a model`,
        );
      }
      // Delegation ONLY: the registry owns the single model boundary.
      return options.instances.bind(scope, instanceId, requestedModelRef);
    },

    releasePawn(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord {
      return options.instances.release(scope, instanceId);
    },

    getPawnInstance(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord | undefined {
      return options.instances.get(scope, instanceId);
    },

    listPawnInstances(scope: TenantScope): readonly PawnInstanceRecord[] {
      return options.instances.list(scope);
    },

    async executePawn(scope: TenantScope, task: TransformPawnTask): Promise<PawnExecutionRecord> {
      let history = historyByTenant.get(scope.tenantId as string);
      if (history === undefined) {
        history = [];
        historyByTenant.set(scope.tenantId as string, history);
      }
      return runPawnExecution(scope, task, {
        instances: options.instances,
        transformSource: options.transformSource,
        artifactSource: options.artifactSource,
        rightsGate: options.rightsGate,
        engineRunner: options.engineRunner,
        executor: options.executor,
        organizationSource: options.organizationSource,
        pawnOfInstance,
        append: (record) => history.push(record),
        now,
        executionIdFactory,
        engineJobIdFactory,
      });
    },

    getPawnExecution(
      scope: TenantScope,
      executionId: PawnExecutionId,
    ): PawnExecutionRecord | undefined {
      const history = historyByTenant.get(scope.tenantId as string);
      if (history === undefined) return undefined;
      return history.find((record) => (record.executionId as string) === (executionId as string));
    },

    listPawnExecutions(scope: TenantScope): readonly PawnExecutionRecord[] {
      return historyByTenant.get(scope.tenantId as string) ?? [];
    },
  };

  return { execution };
}

import type { TenantScope, Timestamp } from '@mos/contracts';
import type { CapabilityRegistryPort } from '@mos/capabilities';
import type {
  ProposeTransformCandidateInput,
  ReviseTransformCandidateInput,
  TransformCandidate,
  TransformCandidateId,
} from '../contracts/transform-candidate.js';
import type { TransformDefinitionInput, TransformDefinitionRegistry } from '../contracts/transform-definition.js';
import type { TransformGraphPort } from '../contracts/transform-graph.js';
import type { IdeaGraph } from '../contracts/idea-graph.js';
import type {
  RecordTransformGateEvidenceInput,
  TransformGateEvidenceEntry,
  TransformPromotionGateName,
} from '../contracts/transform-promotion-gates.js';
import type {
  TransformDiscoveryError,
  TransformDiscoveryPort,
  TransformPromotion,
  TransformPromotionAttempt,
  TransformGateOutcome,
} from '../contracts/transform-discovery.js';
import { cloneDeep, deepFreeze } from './parametric-support.js';
import {
  GATES,
  PROMOTION_FAILURE_CODE,
  buildGateEvidence,
  checkGateAtPromotion,
  type TransformGateDependencies,
} from './transform-discovery-gates.js';
import { buildCandidateRecord, prepareCandidate, type CandidateWriteContext } from './transform-discovery-writes.js';

/**
 * Options for {@link createInMemoryTransformDiscovery}.
 *
 * `definitions` is the W5-A registry view used to resolve KNOWN citations,
 * validate COMPOSED members and materialize promotions through the
 * append-only register/revise paths. `capabilities` is the
 * `@mos/capabilities` vocabulary view gate 2 resolves requirement refs
 * against. `graphs` resolves COMPOSED citations. `ideaGraph` is OPTIONAL:
 * when wired, discovered candidates' Idea Graph references must resolve
 * (LAB-003 discipline); when absent, derivation references are validated
 * structurally only (disclosed — the composition root wires the real
 * graph). `now` is injectable for deterministic timestamps.
 */
export interface InMemoryTransformDiscoveryOptions {
  readonly definitions: Pick<
    TransformDefinitionRegistry,
    'getTransformDefinition' | 'registerTransformDefinition' | 'reviseTransformDefinition'
  >;
  readonly capabilities: Pick<CapabilityRegistryPort, 'get'>;
  readonly graphs: Pick<TransformGraphPort, 'getTransformGraph'>;
  readonly ideaGraph?: Pick<IdeaGraph, 'getIdeaNode'>;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

/**
 * Build an in-memory {@link TransformDiscoveryPort} (LAB-012).
 *
 * W6-A GROUNDWORK DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). Candidates are versioned append-only
 * (clone-then-freeze ownership); gate evidence and promotion attempts live
 * in append-only logs — nothing is ever rewritten or deleted, so a rejected
 * candidate stays recorded with its named gate failure. Capability
 * feasibility is DECLARATIVE (refs resolve in the capability registry
 * vocabulary — never an engine claim); rights/policy feasibility is
 * structural declarations only (real evaluation is composition-root
 * wiring); evaluator EXECUTION is not this surface (the reference plus the
 * contract shape is); benchmark evidence accepts complete frozen
 * `EngineBenchmark` records only. NO AUTO-PRODUCTION (§24): the port has no
 * deploy/publish surface — promotion only makes a transform AVAILABLE to
 * program search (LAB-016).
 */
export function createInMemoryTransformDiscovery(
  options: InMemoryTransformDiscoveryOptions,
): TransformDiscoveryPort {
  const now = options.now ?? nowDefault;
  const deps: TransformGateDependencies = {
    definitions: options.definitions,
    capabilities: options.capabilities,
    graphs: options.graphs,
    ...(options.ideaGraph === undefined ? {} : { ideaGraph: options.ideaGraph }),
  };
  const writeCtx: CandidateWriteContext = {
    definitions: options.definitions,
    graphs: options.graphs,
    gateDeps: deps,
  };
  const definitions = options.definitions;

  /** Candidate version chains keyed per (tenant, id). */
  const chains = new Map<string, TransformCandidate[]>();
  /** Append-only gate-evidence logs keyed per (tenant, candidate id). */
  const gateLogs = new Map<string, TransformGateEvidenceEntry[]>();
  /** Append-only promotion-attempt trails keyed per (tenant, candidate id). */
  const attempts = new Map<string, TransformPromotionAttempt[]>();

  // W9-B: JSON array key — injective over the (tenant, candidate) tuple, so
  // a hostile tenant id containing the old NUL delimiter can never alias
  // another tenant's candidate chain (the W3-A hostile-id-factory class).
  const key = (tenantId: string, candidateId: TransformCandidateId): string =>
    JSON.stringify([tenantId, candidateId as string]);

  const fail = (
    error: TransformDiscoveryError['error'],
    message: string,
    gate?: TransformPromotionGateName,
  ): TransformDiscoveryError => ({ error, message, ...(gate === undefined ? {} : { gate }) });

  const latestOf = (
    tenantId: string,
    candidateId: TransformCandidateId,
  ): TransformCandidate | undefined => {
    const chain = chains.get(key(tenantId, candidateId));
    return chain === undefined || chain.length === 0 ? undefined : chain[chain.length - 1];
  };

  // -------------------------------------------------------------------------
  // Promotion (all seven §8 gates, fail-closed, in §8 order)
  // -------------------------------------------------------------------------

  const appendAttempt = (scope: TenantScope, attempt: TransformPromotionAttempt): void => {
    const log = attempts.get(key(scope.tenantId, attempt.candidateId)) ?? [];
    log.push(Object.freeze(attempt));
    attempts.set(key(scope.tenantId, attempt.candidateId), log);
  };

  const promote = async (
    scope: TenantScope,
    candidateId: TransformCandidateId,
  ): Promise<TransformPromotion | TransformDiscoveryError> => {
    const current = latestOf(scope.tenantId, candidateId);
    if (current === undefined) {
      return fail('candidate-not-found', `transform candidate does not resolve in this tenant scope: ${candidateId}`);
    }
    const priorAttempts = attempts.get(key(scope.tenantId, candidateId)) ?? [];
    const attemptIndex = priorAttempts.length + 1;
    if (priorAttempts.some((attempt) => attempt.outcome === 'promoted' && attempt.candidateVersion === current.version)) {
      return fail(
        'already-promoted',
        `candidate version ${String(current.version)} is already promoted (frozen) — revise the candidate to append a new version`,
      );
    }

    const log = gateLogs.get(key(scope.tenantId, candidateId)) ?? [];
    const evidenceAtCurrentVersion = (
      gate: TransformPromotionGateName,
    ): TransformGateEvidenceEntry | undefined => {
      // Latest entry wins: re-recording a gate appends, never rewrites.
      for (let index = log.length - 1; index >= 0; index -= 1) {
        const candidate = log[index];
        if (candidate !== undefined && candidate.candidateVersion === current.version && candidate.evidence.gate === gate) {
          return candidate;
        }
      }
      return undefined;
    };

    const reject = (
      error: TransformDiscoveryError['error'],
      reason: string,
      gate: TransformPromotionGateName | null,
    ): TransformDiscoveryError => {
      appendAttempt(scope, {
        attempt: attemptIndex,
        candidateId,
        candidateVersion: current.version,
        outcome: 'rejected',
        failedGate: gate,
        reason,
        definitionId: null,
        definitionVersion: null,
        attemptedAt: now(),
      });
      return gate === null ? { error, message: reason } : { error, message: reason, gate };
    };

    const gateOutcomes: TransformGateOutcome[] = [];
    for (const gate of GATES) {
      const entry = evidenceAtCurrentVersion(gate);
      if (entry === undefined) {
        return reject(
          'gate-evidence-missing',
          `no ${gate} evidence recorded at candidate version ${String(current.version)} — the gate record is missing or stale`,
          gate,
        );
      }
      const reason = await checkGateAtPromotion(deps, scope, current, entry.evidence);
      if (reason !== null) {
        return reject(PROMOTION_FAILURE_CODE[gate], reason, gate);
      }
      gateOutcomes.push({ gate, passed: true, entryId: entry.entryId });
    }

    // All seven gates passed — materialize through the registry's
    // APPEND-ONLY path (register for a new target id, revise for an
    // existing one; never in-place mutation).
    const definitionInput = {
      ...(cloneDeep(current.proposedContract) as object),
      scope,
      id: current.targetDefinitionId,
    } as TransformDefinitionInput;
    const existing = await definitions.getTransformDefinition(scope, current.targetDefinitionId);
    const registryResult =
      existing === null
        ? await definitions.registerTransformDefinition(definitionInput)
        : await definitions.reviseTransformDefinition(definitionInput);
    if ('error' in registryResult) {
      return reject(
        'promotion-registry-failure',
        `the registry rejected the promotion write: ${registryResult.error} — ${registryResult.message}`,
        null,
      );
    }
    appendAttempt(scope, {
      attempt: attemptIndex,
      candidateId,
      candidateVersion: current.version,
      outcome: 'promoted',
      failedGate: null,
      reason: 'all seven §8 gates passed',
      definitionId: registryResult.id,
      definitionVersion: registryResult.version,
      attemptedAt: now(),
    });
    return deepFreeze({
      candidateId,
      candidateVersion: current.version,
      origin: current.origin,
      definitionId: registryResult.id,
      definitionVersion: registryResult.version,
      promotionPath: 'registry-append-only',
      gates: Object.freeze(gateOutcomes),
      promotedAt: now(),
    });
  };

  return {
    async proposeTransformCandidate(input: ProposeTransformCandidateInput) {
      const preparation = await prepareCandidate(writeCtx, input.scope, input);
      if (preparation.problem !== null) {
        return preparation.problem;
      }
      if (latestOf(input.scope.tenantId, input.id) !== undefined) {
        return fail('duplicate-candidate', `transform candidate already exists in this tenant scope: ${input.id}`);
      }
      const record = buildCandidateRecord(input, preparation.citation, 1, now);
      chains.set(key(input.scope.tenantId, input.id), [record]);
      return record;
    },

    async reviseTransformCandidate(input: ReviseTransformCandidateInput) {
      // Existence first (unknown and cross-tenant indistinguishable): a
      // revision of an unknown candidate fails closed before any validation.
      const current = latestOf(input.scope.tenantId, input.id);
      if (current === undefined) {
        return fail('candidate-not-found', `transform candidate does not resolve in this tenant scope: ${input.id}`);
      }
      const preparation = await prepareCandidate(writeCtx, input.scope, input);
      if (preparation.problem !== null) {
        return preparation.problem;
      }
      const revised = buildCandidateRecord(input, preparation.citation, current.version + 1, now);
      chains.get(key(input.scope.tenantId, input.id))?.push(revised);
      return revised;
    },

    async getTransformCandidate(scope: TenantScope, candidateId: TransformCandidateId, version?: number) {
      const chain = chains.get(key(scope.tenantId, candidateId));
      if (chain === undefined) {
        return null;
      }
      const record =
        version === undefined ? chain[chain.length - 1] : chain.find((entry) => entry.version === version);
      return record === undefined ? null : record;
    },

    async listTransformCandidates(scope: TenantScope) {
      const latest: TransformCandidate[] = [];
      for (const [, chain] of chains) {
        // W9-B: EXACT tenant equality on the stored record (never a prefix
        // scan — a delimiter-laden tenant id must not widen the match).
        const record = chain[chain.length - 1];
        if (record !== undefined && (record.tenantId as string) === (scope.tenantId as string)) {
          latest.push(record);
        }
      }
      return latest;
    },

    async recordTransformGateEvidence(input: RecordTransformGateEvidenceInput) {
      const current = latestOf(input.scope.tenantId, input.candidateId);
      if (current === undefined) {
        return fail('candidate-not-found', `transform candidate does not resolve in this tenant scope: ${input.candidateId}`);
      }
      const built = await buildGateEvidence(deps, input.scope, current, input.evidence);
      if ('error' in built) {
        return built;
      }
      const log = gateLogs.get(key(input.scope.tenantId, input.candidateId)) ?? [];
      const entry: TransformGateEvidenceEntry = Object.freeze({
        entryId: `evidence-${String(log.length + 1)}`,
        candidateId: input.candidateId,
        candidateVersion: current.version,
        // deepFreeze: the evidence record (e.g. the contract-validation
        // snapshot) must be frozen NESTED too — the append-only log can never
        // be mutated through a returned entry.
        evidence: deepFreeze(built),
        recordedAt: now(),
      });
      log.push(entry);
      gateLogs.set(key(input.scope.tenantId, input.candidateId), log);
      return entry;
    },

    async listTransformGateEvidence(scope: TenantScope, candidateId: TransformCandidateId) {
      return [...(gateLogs.get(key(scope.tenantId, candidateId)) ?? [])];
    },

    async promoteTransformCandidate(scope: TenantScope, candidateId: TransformCandidateId) {
      return promote(scope, candidateId);
    },

    async listTransformPromotionAttempts(scope: TenantScope, candidateId: TransformCandidateId) {
      return [...(attempts.get(key(scope.tenantId, candidateId)) ?? [])];
    },
  };
}

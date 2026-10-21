import type { TenantScope } from '@mos/contracts';
import type {
  AgentsAuthorityPort,
  AgentsValidationReceipt,
  AgentsRejection,
  ClockPort,
  CompiledOrganizationCandidate,
  IntelligenceCitationsPort,
  RightsAuthorityPort,
  RightsVerdict,
} from '@mos/missions';
import type { Version } from '@mos/contracts';
import type { AgentBodyId } from '../../mos-agents/dist/index.js';
import type {
  AgentOrganizationRecord,
  OrganizationRegistryPort,
} from '../../mos-agents/dist/index.js';
import {
  AgentOrganizationRegistrationConflictError,
  InvalidAgentOrganizationError,
} from '../../mos-agents/dist/index.js';
import type { ProductIntelligencePort } from '../../mos-product-intelligence/dist/index.js';
import type { RightsRepository } from '../../mos-rights/dist/index.js';

/**
 * The compiler's compile-time authority ports (the CONSOLE wave, Worker C):
 * the RightsAuthorityPort (§27 — over the REAL shared rights repository),
 * the IntelligenceCitationsPort (§25 — over the REAL product-intelligence
 * authority) and the AgentsAuthorityPort (AGT-003 — over the REAL
 * organization registry). The StrategyCompiler and AutomationEngine run
 * against EXACTLY these bindings.
 *
 * THE RIGHTS GATE (the task's shared-gate composition): a grant covering
 * the `analyze` action for the principal's tenant — ACTIVE (not revoked,
 * not expired) — allows compilation / arming; anything else denies with the
 * reason/attribution/authority strings composed honestly over the
 * repository's own record states (the compiler/engine wrap them into their
 * verbatim COMPILE_RIGHTS_DENIED / ARM_RIGHTS_DENIED templates).
 *
 * THE INTELLIGENCE CITATIONS adapter resolves the compiler's citations
 * through the REAL §25 authority and derives each record's health status
 * honestly from its OWN basis: a `cited-external-evidence` record is
 * `provider-CONFIRMED` (evidence observed outside this authority); a
 * `counterfactual-forecast` record is `unconfirmed` (a forecast is never
 * confirmed reality — the MARKETING-001 platform-choice gate then rejects
 * it with PLATFORM_HEALTH_NOT_CONFIRMED, honestly).
 *
 * THE AGENTS VALIDATION converts the compiled organization candidate into
 * an AgentOrganizationRecord and attempts REAL AGT-003 registration (the
 * task's disclosed decision): the receipt echoes the registry's own
 * authority record; rejections relay the registry's named reasons
 * VERBATIM. The conversion's disclosed coarse mappings (the registry's
 * frozen vocabularies do not carry the compiler's typed-edge semantics):
 *  - role → body: the composition's registered standard body catalog
 *    (controller / producer:* / critic / analyst / generalist);
 *  - delegation edges: every typed compiler edge maps to
 *    `communicates-with` (the registry's FUNCTIONAL delegation vocabulary
 *    cannot express review/escalation fan-out — the typed edges stay on
 *    the compiled strategy, which the Plan read model presents in full);
 *  - budget: the compiled org ceiling over a standard duration envelope;
 *  - termination: maxIterations = the compiled maxSteps, a standard
 *    timeout (the compiled candidate declares step budgets, not wall-clock).
 */

/** The rights gate shared by compile + arm (over the REAL repository). */
export function createConsoleRightsGate(options: {
  readonly rightsRepository: RightsRepository;
  readonly now: () => string;
}): RightsAuthorityPort {
  const verdictOf = (tenantId: string, principal: string): RightsVerdict => {
    const grants = options.rightsRepository.listRightsGrants({
      tenantId: tenantId as never,
    } as TenantScope);
    const active = grants.find(
      (grant) =>
        grant.revokedAt === null &&
        (grant.expiresAt === null || grant.expiresAt > options.now()) &&
        (grant.scope.actions as readonly string[]).includes('analyze'),
    );
    if (active !== undefined) {
      return { kind: 'allow' };
    }
    return {
      kind: 'deny',
      reason: `no active rights grant covering the analyze action exists for tenant ${tenantId} (principal ${principal}) — the rights repository holds ${grants.length} grant(s) for this tenant and none is an active analyze grant`,
      attribution: 'rights-authority (the in-memory rights repository behind the console composition)',
      authority: 'rights-authority',
    };
  };
  return {
    async checkCompileRight(input) {
      return verdictOf(input.tenantId, input.principal);
    },
    async checkRunRight(input) {
      return verdictOf(input.tenantId, input.principal);
    },
  };
}

/** The §25 citations adapter over the REAL product-intelligence authority. */
export function createConsoleIntelligenceCitations(options: {
  readonly productIntelligence: ProductIntelligencePort;
}): IntelligenceCitationsPort {
  return {
    async resolveProductIntelligenceCitations(citations, tenantId) {
      const result = await options.productIntelligence.resolveProductIntelligenceCitations(
        { tenantId: tenantId as never } as TenantScope,
        citations.map((citation) => ({
          recordId: citation.recordId as never,
          version: citation.recordVersion,
        })),
      );
      if ('error' in result) {
        return {
          kind: 'unresolved',
          recordId: '',
          issue: `${result.error}: ${result.message}`,
        };
      }
      return {
        kind: 'resolved',
        records: result.map((record) => ({
          kind: 'product-intelligence-record',
          recordId: String(record.id),
          recordVersion: record.version,
          summary: `${String(record.kind)} recorded under rights ref ${String(record.rightsRef)} (${record.source.sourceKind})`,
          healthStatus:
            record.basis.basis === 'cited-external-evidence'
              ? ('provider-CONFIRMED' as const)
              : ('unconfirmed' as const),
        })),
      };
    },
  };
}

/** The standard body id for one compiled role id (the disclosed catalog). */
export function bodyIdOfRole(roleId: string): string {
  if (roleId === 'controller') {
    return 'body-console-controller';
  }
  if (roleId.startsWith('producer:')) {
    return 'body-console-producer';
  }
  if (roleId === 'critic') {
    return 'body-console-critic';
  }
  if (roleId === 'analyst') {
    return 'body-console-analyst';
  }
  return 'body-console-generalist';
}

/** The disclosed standard duration / timeout envelopes of the conversion. */
const CONVERSION_DURATION_MS = 14 * 86_400_000;
const CONVERSION_TIMEOUT_MS = 3_600_000;

/** Convert a compiled candidate into the registry's organization record. */
export function organizationRecordOf(
  candidate: CompiledOrganizationCandidate,
): AgentOrganizationRecord {
  const perRoleCeilings = Object.values(candidate.budgets.perRole);
  const perNodeCeiling = perRoleCeilings.length > 0 ? Math.max(...perRoleCeilings) : 0;
  return {
    id: candidate.name as never,
    version: 1 as Version,
    tenantId: candidate.tenantId as never,
    nodes: candidate.roles.map((role) => ({
      nodeId: role.roleId,
      role: role.title,
      bodyId: bodyIdOfRole(role.roleId) as AgentBodyId,
    })),
    edges: candidate.delegationEdges.map((edge) => ({
      fromNodeId: edge.fromRoleId,
      toNodeId: edge.toRoleId,
      kind: 'communicates-with',
    })),
    modelAssignments: candidate.roles.map((role) => ({
      nodeId: role.roleId,
      modelRef: role.modelId as never,
    })),
    memoryPolicy: {
      scope: 'session',
      sharing: candidate.memorySharing.sharedScopes.length > 0 ? 'shared' : 'isolated',
    },
    budgetPolicy: {
      organization: {
        maxCost: { amount: candidate.budgets.orgCeiling, currency: candidate.budgets.currency },
        maxDurationMs: CONVERSION_DURATION_MS,
      },
      perNode: {
        maxCost: { amount: perNodeCeiling, currency: candidate.budgets.currency },
        maxDurationMs: CONVERSION_DURATION_MS,
      },
    },
    terminationPolicy: {
      maxIterations: candidate.termination.maxSteps,
      timeoutMs: CONVERSION_TIMEOUT_MS,
    },
    evaluator: 'evaluator:agents-registry/console-compiled',
  };
}

/** The AGT-003 validation over the REAL organization registry. */
export function createConsoleAgentsValidation(options: {
  readonly organizationRegistry: OrganizationRegistryPort;
}): AgentsAuthorityPort {
  return {
    async validateOrganization(candidate) {
      const record = organizationRecordOf(candidate);
      try {
        options.organizationRegistry.registerOrganization(
          { tenantId: candidate.tenantId as never } as TenantScope,
          record,
        );
        const receipt: AgentsValidationReceipt = {
          accepted: true,
          authorityRecord: `agents-registry:${String(record.id)}@v${record.version}`,
        };
        return receipt;
      } catch (error) {
        if (error instanceof InvalidAgentOrganizationError) {
          const first = error.reasons[0];
          const rejection: AgentsRejection = {
            accepted: false,
            rejectionName: first === undefined ? 'invalid-agent-organization' : first.code,
            detail: error.reasons
              .map((reason) => `${reason.code} (${reason.detail})`)
              .join('; '),
            authorityRecord: 'agents-registry (registration rejected — nothing recorded)',
          };
          return rejection;
        }
        if (error instanceof AgentOrganizationRegistrationConflictError) {
          const rejection: AgentsRejection = {
            accepted: false,
            rejectionName: error.code,
            detail: error.message,
            authorityRecord: 'agents-registry (registration conflict — nothing recorded)',
          };
          return rejection;
        }
        const reason = error instanceof Error ? error.message : String(error);
        const rejection: AgentsRejection = {
          accepted: false,
          rejectionName: 'agents-registry-fault',
          detail: reason,
          authorityRecord: 'agents-registry (fault — nothing recorded)',
        };
        return rejection;
      }
    },
  };
}

/** The composition's clock port (deterministic over the injectable clock). */
export function createConsoleClock(options: { readonly now: () => string }): ClockPort {
  return {
    now() {
      return new Date(options.now());
    },
  };
}

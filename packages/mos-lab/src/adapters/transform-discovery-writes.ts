import type { TenantScope, Timestamp } from '@mos/contracts';
import type {
  ComposedTransformCitation,
  KnownTransformCitation,
  ProposeTransformCandidateInput,
  ReviseTransformCandidateInput,
  TransformCandidate,
  TransformCandidateId,
} from '../contracts/transform-candidate.js';
import type { TransformDefinitionRegistry } from '../contracts/transform-definition.js';
import type { TransformGraphPort } from '../contracts/transform-graph.js';
import type { TransformDiscoveryError } from '../contracts/transform-discovery.js';
import type { TransformGateDependencies } from './transform-discovery-gates.js';
import { validateCandidateDerivation } from './transform-discovery-gates.js';
import { cloneDeep, deepFreeze, isBlankString, isPlainObject, isPositiveInteger } from './parametric-support.js';
import { validateTransformContractDeclaration } from './transform-contract-validation.js';

/**
 * Candidate WRITE rules for the in-memory transform discovery adapter
 * (LAB-012 internals): proposal/revision validation (origin citation
 * resolution + derivation provenance + the SHARED contract rules) and the
 * immutable candidate-version record construction.
 *
 * Split from in-memory-transform-discovery.ts to respect the managed-file
 * line budget (the W3-A/W5-A split precedent). Everything here is internal —
 * NOT exported from the package index.
 */

/** The dependency views candidate writes need. */
export interface CandidateWriteContext {
  readonly definitions: Pick<
    TransformDefinitionRegistry,
    'getTransformDefinition' | 'registerTransformDefinition' | 'reviseTransformDefinition'
  >;
  readonly graphs: Pick<TransformGraphPort, 'getTransformGraph'>;
  readonly gateDeps: TransformGateDependencies;
}

/** Result of a successful candidate preparation (validated + citation resolved). */
export interface CandidatePreparation {
  readonly citation: KnownTransformCitation | ComposedTransformCitation | null;
  readonly problem: null;
}

/**
 * Resolve the ORIGIN citation of a proposal (§8):
 * - KNOWN — the definition must resolve at its EXACT cited version;
 * - COMPOSED — the graph must resolve at its EXACT cited version AND every
 *   member definition the graph's nodes cite at THEIR exact versions (the
 *   members are resolved here so the composition template is reproducible
 *   bit-for-bit even if the graph later gains new versions);
 * - DISCOVERED — no citation; the derivation provenance is the evidence
 *   surface (supplying one anyway is `invalid-input`).
 */
export const resolveCandidateCitation = async (
  ctx: CandidateWriteContext,
  scope: TenantScope,
  input: ProposeTransformCandidateInput | ReviseTransformCandidateInput,
): Promise<CandidatePreparation | { readonly citation: null; readonly problem: TransformDiscoveryError }> => {
  if (input.origin === 'known') {
    const known = input.known;
    if (
      !isPlainObject(known) ||
      typeof known.definitionId !== 'string' ||
      isBlankString(known.definitionId) ||
      !isPositiveInteger(known.definitionVersion)
    ) {
      return {
        citation: null,
        problem: { error: 'invalid-input', message: 'origin "known" requires a known citation { definitionId, definitionVersion }' },
      };
    }
    const definition = await ctx.definitions.getTransformDefinition(
      scope,
      known.definitionId,
      known.definitionVersion,
    );
    if (definition === null) {
      return {
        citation: null,
        problem: {
          error: 'unknown-cited-definition',
          message: `cited transform definition does not resolve at the exact version in this tenant scope: ${known.definitionId}@${String(known.definitionVersion)}`,
        },
      };
    }
    return { citation: { definitionId: known.definitionId, definitionVersion: known.definitionVersion }, problem: null };
  }
  if (input.origin === 'composed') {
    const composed = input.composed;
    if (
      !isPlainObject(composed) ||
      typeof composed.graphId !== 'string' ||
      isBlankString(composed.graphId) ||
      !isPositiveInteger(composed.graphVersion)
    ) {
      return {
        citation: null,
        problem: { error: 'invalid-input', message: 'origin "composed" requires a composed citation { graphId, graphVersion }' },
      };
    }
    const graph = await ctx.graphs.getTransformGraph(scope, composed.graphId, composed.graphVersion);
    if (graph === null) {
      return {
        citation: null,
        problem: {
          error: 'unknown-cited-graph',
          message: `cited transform graph does not resolve at the exact version in this tenant scope: ${composed.graphId}@${String(composed.graphVersion)}`,
        },
      };
    }
    const members: KnownTransformCitation[] = [];
    for (const node of graph.nodes) {
      const member = await ctx.definitions.getTransformDefinition(scope, node.definitionId, node.definitionVersion);
      if (member === null) {
        return {
          citation: null,
          problem: {
            error: 'unknown-cited-definition',
            message: `composed graph member does not resolve at its exact version: ${String(node.definitionId)}@${String(node.definitionVersion)}`,
          },
        };
      }
      members.push({ definitionId: node.definitionId, definitionVersion: node.definitionVersion });
    }
    return {
      citation: Object.freeze({ graphId: composed.graphId, graphVersion: composed.graphVersion, members: Object.freeze(members) }),
      problem: null,
    };
  }
  if (input.known !== undefined || input.composed !== undefined) {
    return {
      citation: null,
      problem: {
        error: 'invalid-input',
        message: 'origin "discovered" carries no citation — derivation provenance is the evidence surface',
      },
    };
  }
  return { citation: null, problem: null };
};

/**
 * FULL proposal/revision validation (ONE pass): input shape, origin,
 * citation resolution, derivation provenance and the SHARED structural
 * contract rules — the same rules the W5-A registry applies, so a candidate
 * that cannot become a definition version is rejected at proposal time.
 */
export const prepareCandidate = async (
  ctx: CandidateWriteContext,
  scope: TenantScope,
  input: ProposeTransformCandidateInput | ReviseTransformCandidateInput,
): Promise<CandidatePreparation | { readonly citation: null; readonly problem: TransformDiscoveryError }> => {
  if (!isPlainObject(input) || typeof input.id !== 'string' || isBlankString(input.id)) {
    return { citation: null, problem: { error: 'invalid-input', message: 'candidate id must be a non-blank string' } };
  }
  if (input.origin !== 'known' && input.origin !== 'composed' && input.origin !== 'discovered') {
    return {
      citation: null,
      problem: {
        error: 'invalid-input',
        message: `candidate origin must be known | composed | discovered (got: ${String(input.origin)})`,
      },
    };
  }
  if (typeof input.targetDefinitionId !== 'string' || isBlankString(input.targetDefinitionId)) {
    return {
      citation: null,
      problem: { error: 'invalid-input', message: 'targetDefinitionId must be a non-blank transform definition id' },
    };
  }
  const citation = await resolveCandidateCitation(ctx, scope, input);
  if (citation.problem !== null) {
    return citation;
  }
  const derivationProblem = await validateCandidateDerivation(
    ctx.gateDeps,
    scope,
    input.derivation,
    input.origin === 'discovered',
  );
  if (derivationProblem !== null) {
    return { citation: null, problem: derivationProblem };
  }
  const contractProblem = validateTransformContractDeclaration(input.proposedContract);
  if (contractProblem !== null) {
    return { citation: null, problem: { error: 'invalid-input', message: contractProblem.message } };
  }
  return citation;
};

/**
 * Build one immutable candidate-version record (clone-then-freeze ownership:
 * caller data is never retained by reference or frozen in place).
 */
export const buildCandidateRecord = (
  input: ProposeTransformCandidateInput | ReviseTransformCandidateInput,
  citation: KnownTransformCitation | ComposedTransformCitation | null,
  version: number,
  now: () => Timestamp,
): TransformCandidate =>
  Object.freeze({
    id: input.id as TransformCandidateId,
    version,
    tenantId: input.scope.tenantId,
    origin: input.origin,
    citation: citation === null ? null : deepFreeze(cloneDeep(citation)),
    derivation: deepFreeze(cloneDeep(input.derivation)),
    proposedContract: deepFreeze(cloneDeep(input.proposedContract)),
    targetDefinitionId: input.targetDefinitionId,
    createdAt: now(),
  });

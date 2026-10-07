import type {
  EngineBenchmark,
  EngineBenchmarkId,
  BenchmarkCorpusRef,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from '@mos/contracts';
import { SEED_CAPABILITY_CATALOG, createInMemoryCapabilityRegistry } from '@mos/capabilities';
import type { CapabilityRegistryPort } from '@mos/capabilities';
import { createInMemoryCorpusStore } from '../adapters/in-memory-corpus-store.js';
import { createInMemoryFeatureBundleRegistry } from '../adapters/in-memory-feature-bundle-registry.js';
import { createInMemoryIdeaGraph } from '../adapters/in-memory-idea-graph.js';
import { createInMemoryTransformDefinitionRegistry } from '../adapters/in-memory-transform-definition-registry.js';
import { createInMemoryTransformGraph } from '../adapters/in-memory-transform-graph.js';
import { createInMemoryTransformDiscovery } from '../adapters/in-memory-transform-discovery.js';
import type { TransformDefinitionRegistry } from '../contracts/transform-definition.js';
import type { TransformGraphPort } from '../contracts/transform-graph.js';
import type { IdeaGraph, IdeaNodeId } from '../contracts/idea-graph.js';
import type { TransformDiscoveryPort } from '../contracts/transform-discovery.js';
import type {
  ProposeTransformCandidateInput,
  TransformCandidateId,
} from '../contracts/transform-candidate.js';
import type { RecordTransformGateEvidenceInput } from '../contracts/transform-promotion-gates.js';
import type { CreateHumanProductionTaskInput } from '../contracts/human-production-task.js';
import type { ArenaProviderRef } from '../contracts/arena-provider-seam.js';
import {
  FIXED_NOW,
  artifactRef,
  definitionIdOf,
  definitionInputOf,
  scopeOf,
} from './w5a-transform-fixtures.js';

/**
 * INTERNAL W6-A test fixtures (LAB-012 + LAB-014 tests). NOT exported from
 * the package index — test scaffolding only, never production surface.
 *
 * The discovery stacks compose the package's own disclosed in-memory
 * adapters over the REAL @mos/capabilities seed catalog (the §5 vocabulary)
 * and the W5-A transform definition/graph surfaces; the idea-graph fixture
 * wires the LAB-001/002/003 stack so discovered candidates carry genuine
 * Idea Graph derivation provenance. The human-task fixtures build complete
 * twelve-field §17 task packages.
 */

// ---------------------------------------------------------------------------
// LAB-012: discovery stacks
// ---------------------------------------------------------------------------

/** A rights gate double that allows everything (disclosed, structural). */
const allowAllRights = {
  checkAcquisitionRights: async (): Promise<{ ok: true }> => ({ ok: true }),
};

/** One idea node with genuine LAB-003 derivation provenance. */
export const ideaGraphStack = async (
  tenant = 'tenant-a',
): Promise<{ ideaNodeId: IdeaNodeId; ideas: IdeaGraph }> => {
  const scope = scopeOf(tenant);
  const corpus = createInMemoryCorpusStore({ rights: allowAllRights, now: FIXED_NOW });
  const document = await corpus.ingestReferenceDocument({
    scope,
    document: {
      id: 'doc-source-1' as never,
      niche: 'marketing-engineering',
      platform: 'web',
      modality: 'video',
      artifact: artifactRef('source-1', { tenant }),
      sourceRefs: ['https://example.com/source-1'],
      acquiredAt: FIXED_NOW(),
      rightsRef: 'grant-source-1' as never,
      provenanceRef: 'prov-source-1' as never,
    },
  });
  if ('error' in document) {
    throw new Error(`fixture corpus ingestion failed: ${document.message}`);
  }
  const bundles = createInMemoryFeatureBundleRegistry({ corpus, now: FIXED_NOW });
  const ideas = createInMemoryIdeaGraph({ corpus, bundles, now: FIXED_NOW });
  const node = await ideas.addIdeaNode({
    scope,
    id: 'idea-reaction-format' as IdeaNodeId,
    statement: 'Reaction-format content converts best for this niche',
    embeddingRef: null,
    derivation: { documents: [document.id], featureBundles: [] },
    provenanceRef: 'prov-idea-reaction-format' as never,
  });
  if ('error' in node) {
    throw new Error(`fixture idea node failed: ${node.message}`);
  }
  return { ideaNodeId: node.id, ideas };
};

/** The composed-citation fixture graph: source clip → reaction (multi-node). */
export const compositionGraph = async (
  graphs: TransformGraphPort,
  definitions: TransformDefinitionRegistry,
  tenant = 'tenant-a',
): Promise<{ graphId: string; graphVersion: number }> => {
  const scope = scopeOf(tenant);
  const clip = await definitions.registerTransformDefinition(definitionInputOf('clip', tenant));
  const reaction = await definitions.registerTransformDefinition(definitionInputOf('reaction', tenant));
  if ('error' in clip || 'error' in reaction) {
    throw new Error('fixture definition registration failed');
  }
  const graph = await graphs.createTransformGraph({
    scope,
    id: 'graph.clip-then-reaction' as never,
    nodes: [
      {
        nodeId: 'clip-node',
        definitionId: definitionIdOf('clip'),
        definitionVersion: 1 as Version,
        inputs: [artifactRef('source-clip', { tenant })],
        parameterization: { durationSeconds: 30 },
      },
      {
        nodeId: 'reaction-node',
        definitionId: definitionIdOf('reaction'),
        definitionVersion: 1 as Version,
        inputs: [artifactRef('reaction-camera-feed', { tenant })],
        parameterization: { layout: 'pip' },
      },
    ],
    edges: [{ edgeId: 'clip-to-reaction', fromNodeId: 'clip-node', toNodeId: 'reaction-node' }],
  });
  if ('error' in graph) {
    throw new Error(`fixture graph creation failed: ${graph.message}`);
  }
  return { graphId: graph.id, graphVersion: graph.version };
};

export interface DiscoveryStack {
  readonly definitions: TransformDefinitionRegistry;
  readonly capabilities: CapabilityRegistryPort;
  readonly graphs: TransformGraphPort;
  readonly ideaGraph: IdeaGraph | undefined;
  readonly discovery: TransformDiscoveryPort;
  readonly ideaNodeId: IdeaNodeId;
  readonly graph: { readonly graphId: string; readonly graphVersion: number };
}

/**
 * The full LAB-012 discovery stack over the package's own disclosed
 * in-memory adapters: the W5-A definition registry (seeded with the clip +
 * reaction definitions), the REAL @mos/capabilities seed vocabulary, the
 * W5-A graph port carrying the composition fixture, and (by default) the
 * LAB-003 idea graph for derivation resolution.
 */
export const discoveryStack = async (
  tenant = 'tenant-a',
  wireIdeaGraph = true,
): Promise<DiscoveryStack> => {
  const definitions = createInMemoryTransformDefinitionRegistry({ now: FIXED_NOW });
  const capabilities = createInMemoryCapabilityRegistry({ initial: SEED_CAPABILITY_CATALOG });
  const graphs = createInMemoryTransformGraph({ definitions, now: FIXED_NOW });
  const { ideaNodeId, ideas } = await ideaGraphStack(tenant);
  const ideaGraph = wireIdeaGraph ? ideas : undefined;
  const discovery = createInMemoryTransformDiscovery({
    definitions,
    capabilities,
    graphs,
    ...(ideaGraph === undefined ? {} : { ideaGraph }),
    now: FIXED_NOW,
  });
  // The no-op/repost definition is ALWAYS registered — the first-class
  // §8 path must flow through discovery like any other transform.
  const noop = await definitions.registerTransformDefinition(definitionInputOf('no-op-repost', tenant));
  if ('error' in noop) {
    throw new Error(`fixture no-op registration failed: ${noop.message}`);
  }
  const graph = await compositionGraph(graphs, definitions, tenant);
  return { definitions, capabilities, graphs, ideaGraph, discovery, ideaNodeId, graph };
};

// ---------------------------------------------------------------------------
// LAB-012: candidate inputs + benchmark evidence
// ---------------------------------------------------------------------------

export interface CandidateOverrides {
  readonly id?: TransformCandidateId;
  readonly targetDefinitionId?: TransformId;
}

/** The proposed contract used by candidate fixtures (the reaction kind's). */
const proposedContractOf = () => {
  const base = definitionInputOf('reaction');
  return {
    kind: base.kind,
    inputConstraint: base.inputConstraint,
    outputContract: base.outputContract,
    parameters: base.parameters,
    capabilityRequirements: base.capabilityRequirements,
    humanParticipation: base.humanParticipation,
    evaluator: base.evaluator,
    costModel: base.costModel,
    latencyModel: base.latencyModel,
    rightsRequirements: base.rightsRequirements,
    policyRequirements: base.policyRequirements,
    lineageRules: base.lineageRules,
  };
};

const candidateDerivationOf = (ideaNodeId: IdeaNodeId) => ({
  ideaNodeIds: [ideaNodeId],
  featureBundleIds: [] as never[],
  corpusId: null,
  corpusVersion: null,
  learnedStrategyCandidateIds: [] as never[],
  organizationSearchResultIds: [] as never[],
  provenanceRef: 'prov-candidate-proposal' as never,
});

/** A KNOWN candidate citing the no-op/repost definition (first-class path). */
export const knownCandidateInput = (
  tenant = 'tenant-a',
  overrides: CandidateOverrides = {},
): ProposeTransformCandidateInput => {
  const base = definitionInputOf('no-op-repost', tenant);
  return {
    scope: scopeOf(tenant),
    id: overrides.id ?? ('candidate.known-noop' as TransformCandidateId),
    origin: 'known',
    known: { definitionId: definitionIdOf('no-op-repost'), definitionVersion: 1 },
    derivation: {
      ideaNodeIds: [] as never[],
      featureBundleIds: [] as never[],
      corpusId: null,
      corpusVersion: null,
      learnedStrategyCandidateIds: [] as never[],
      organizationSearchResultIds: [] as never[],
      provenanceRef: 'prov-known-candidate' as never,
    },
    proposedContract: {
      kind: base.kind,
      inputConstraint: base.inputConstraint,
      outputContract: base.outputContract,
      parameters: base.parameters,
      capabilityRequirements: [],
      humanParticipation: base.humanParticipation,
      evaluator: base.evaluator,
      costModel: base.costModel,
      latencyModel: base.latencyModel,
      rightsRequirements: base.rightsRequirements,
      policyRequirements: base.policyRequirements,
      lineageRules: base.lineageRules,
    },
    targetDefinitionId: overrides.targetDefinitionId ?? (definitionIdOf('no-op-repost') as TransformId),
  };
};

/** A COMPOSED candidate citing the composition fixture graph. */
export const composedCandidateInput = (
  graphId: string,
  graphVersion: number,
  tenant = 'tenant-a',
  overrides: CandidateOverrides = {},
): ProposeTransformCandidateInput => ({
  scope: scopeOf(tenant),
  id: overrides.id ?? ('candidate.composed-reaction' as TransformCandidateId),
  origin: 'composed',
  composed: { graphId: graphId as never, graphVersion },
  derivation: {
    ideaNodeIds: [] as never[],
    featureBundleIds: [] as never[],
    corpusId: null,
    corpusVersion: null,
    learnedStrategyCandidateIds: [] as never[],
    organizationSearchResultIds: [] as never[],
    provenanceRef: 'prov-composed-candidate' as never,
  },
  proposedContract: proposedContractOf(),
  targetDefinitionId: overrides.targetDefinitionId ?? ('transform.composed-reaction' as TransformId),
});

/** A DISCOVERED candidate with genuine Idea Graph derivation provenance. */
export const discoveredCandidateInput = (
  ideaNodeId: IdeaNodeId,
  tenant = 'tenant-a',
  overrides: CandidateOverrides = {},
): ProposeTransformCandidateInput => ({
  scope: scopeOf(tenant),
  id: overrides.id ?? ('candidate.discovered-reaction' as TransformCandidateId),
  origin: 'discovered',
  derivation: candidateDerivationOf(ideaNodeId),
  proposedContract: proposedContractOf(),
  targetDefinitionId: overrides.targetDefinitionId ?? ('transform.discovered-reaction' as TransformId),
});

/** A COMPLETE frozen-shape EngineBenchmark record fixture (gate 5 evidence). */
export const benchmarkRecord = (
  overrides: Partial<EngineBenchmark> = {},
): EngineBenchmark => ({
  id: 'bench-lab-012-1' as EngineBenchmarkId,
  capabilityVersion: 1 as Version,
  engineVersion: 1 as Version,
  benchmarkCorpusRef: 'benchmark-corpus:lab-fixture@1' as BenchmarkCorpusRef,
  evaluatorVersion: 1 as Version,
  metrics: { score: 0.92 },
  cost: { amount: 0.01, currency: 'USD' },
  latency: 1500,
  licenseStatus: 'cleared',
  result: 'passed',
  ...overrides,
});

/** Attach ALL SEVEN §8 gates for a candidate (the happy-path helper). */
export const attachAllGates = async (
  discovery: TransformDiscoveryPort,
  scope: TenantScope,
  candidateId: TransformCandidateId,
  benchmark: EngineBenchmark = benchmarkRecord(),
): Promise<void> => {
  const candidate = await discovery.getTransformCandidate(scope, candidateId);
  if (candidate === null) {
    throw new Error(`fixture: candidate not found: ${candidateId}`);
  }
  const contract = candidate.proposedContract;
  const inputs: readonly RecordTransformGateEvidenceInput[] = [
    { scope, candidateId, evidence: { gate: 'contract-validation' } },
    { scope, candidateId, evidence: { gate: 'capability-feasibility' } },
    {
      scope,
      candidateId,
      evidence: {
        gate: 'rights-policy-feasibility',
        rightsRequirements: [...contract.rightsRequirements],
        policyRequirements: [...contract.policyRequirements],
      },
    },
    {
      scope,
      candidateId,
      evidence: {
        gate: 'evaluator',
        evaluatorRef: contract.evaluator,
        inputSchema: { type: 'object', properties: { artifactRefs: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { verdict: { type: 'string' } } },
      },
    },
    { scope, candidateId, evidence: { gate: 'bounded-benchmark-evidence', benchmark } },
    { scope, candidateId, evidence: { gate: 'immutable-version', candidateVersion: candidate.version, promotionPath: 'registry-append-only' } },
    { scope, candidateId, evidence: { gate: 'provenance' } },
  ];
  for (const input of inputs) {
    const entry = await discovery.recordTransformGateEvidence(input);
    if ('error' in entry) {
      throw new Error(`fixture: gate ${input.evidence.gate} attach failed: ${entry.message}`);
    }
  }
};

// ---------------------------------------------------------------------------
// LAB-014: human production task packages
// ---------------------------------------------------------------------------

/** The Arena provider reference used by task fixtures (INTEG-001 vocabulary). */
export const arenaProviderRef = (): ArenaProviderRef => ({
  providerId: 'arena-provider-double' as ArenaProviderRef['providerId'],
  providerVersion: 1,
});

export interface HumanTaskOverrides {
  readonly id?: string;
  readonly deadlineAt?: Timestamp;
  readonly substitutes?: CreateHumanProductionTaskInput['acceptableSubstitutes'];
  readonly scriptOrQuestions?: CreateHumanProductionTaskInput['scriptOrQuestions'];
}

/** A COMPLETE twelve-field §17 human production task package fixture. */
export const humanTaskInput = (
  tenant = 'tenant-a',
  overrides: HumanTaskOverrides = {},
): CreateHumanProductionTaskInput => ({
  scope: scopeOf(tenant),
  id: (overrides.id ?? 'human-task.reaction-1') as CreateHumanProductionTaskInput['id'],
  objective: {
    statement: 'Record a reaction to the source clip for the reaction-format strategy',
    successCriteria: ['contributor face visible', 'audio clear at 1080p'],
  },
  sourceReference: {
    artifactRefs: [artifactRef('reaction-source', { tenant })],
    notes: 'The source clip to react to (reference-first — never content bytes)',
  },
  scriptOrQuestions: overrides.scriptOrQuestions ?? {
    kind: 'script',
    beats: ['Hook: what the source claims', 'Analysis: two counterpoints', 'Wrap-up: takeaway'],
  },
  captureInstructions: {
    brief: 'Record a talking-head reaction video over the picture-in-picture source',
    requirements: ['1080p camera', 'lapel microphone', 'quiet room'],
  },
  targetModality: { modality: 'video' },
  requiredArtifacts: {
    artifacts: [{ artifactType: 'video/mp4', minCount: 1 }],
  },
  consent: {
    consentRef: 'consent:reaction-1' as never,
    scope: 'on-camera performance, audio and derivative distribution',
  },
  rights: { rightsRefs: ['rights:source-clip-grant' as never] },
  evaluator: {
    evaluatorRef: 'evaluator:lab:human-task@1' as never,
    inputSchema: { type: 'object', properties: { artifactRefs: { type: 'array' } } },
    outputSchema: { type: 'object', properties: { verdict: { type: 'string' } } },
  },
  deadline: { deadlineAt: overrides.deadlineAt ?? ('2026-06-20T12:00:00.000Z' as Timestamp) },
  delayEconomics: {
    declaration: 'declared-expectations',
    expectedWaitMs: 86_400_000,
    expectedIncrementalValue: { amount: 500, currency: 'USD' },
    delayCost: { amount: 50, currency: 'USD' },
    acquisitionCost: { amount: 100, currency: 'USD' },
    successProbability: 0.8,
    qualityImpact: 0.25,
  },
  acceptableSubstitutes: overrides.substitutes ?? {
    ordered: [
      { preference: 1, path: { kind: 'authorized-collaborator', collaboratorRef: 'identity:collaborator-1' as never } },
      { preference: 2, path: { kind: 'project-owner' } },
    ],
  },
});

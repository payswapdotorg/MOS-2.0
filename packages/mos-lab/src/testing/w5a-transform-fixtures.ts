import type {
  ArtifactRef,
  CapabilityId,
  CapabilityRequirement,
  TenantId,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from '@mos/contracts';
import { SEED_CAPABILITY_IDS } from '@mos/capabilities';
import type {
  TransformDefinitionInput,
  TransformInputConstraint,
  TransformKind,
  TransformOutputContract,
} from '../contracts/transform-definition.js';
import type { ReferenceModality } from '../contracts/corpus.js';

/**
 * INTERNAL W5-A test fixtures (LAB-011 tests). NOT exported from the package
 * index — test scaffolding only, never production surface.
 *
 * The thirteen frozen §5 transform kinds as one minimal DECLARED definition
 * each (declarative constraints only — no engine specifics). Capability
 * requirements draw from the REAL `@mos/capabilities` §5 seed catalog ids
 * (the registry-declared vocabulary), so the fixtures exercise the actual
 * capability-contract vocabulary rather than invented ids. The no-op/repost
 * definition is a REAL definition with REAL constraints and ZERO capability
 * requirements — the pinned first-class state (lock rule 5).
 */

export const FIXED_NOW = (): Timestamp => '2026-06-15T12:00:00.000Z' as Timestamp;

export const scopeOf = (tenant: string): TenantScope => ({
  tenantId: tenant as TenantId,
});

/** The thirteen frozen kinds in §5 order. */
export const THIRTEEN_KINDS: readonly TransformKind[] = [
  'no-op-repost',
  'clip',
  'crop-reframe',
  'remix',
  'compilation',
  'reaction',
  'podcast',
  'translation-dubbing',
  'voiceover',
  'stylization-anime',
  'ai-generated',
  'human-contribution',
  'hybrid',
];

/** Resolve one capability requirement pinned to the seed catalog (version 1). */
export const seedCapability = (name: string): CapabilityRequirement => {
  const id = SEED_CAPABILITY_IDS.find((candidate) => candidate === (name as CapabilityId));
  if (id === undefined) {
    throw new Error(`fixture capability is not in the @mos/capabilities seed catalog: ${name}`);
  }
  return { capabilityId: id, version: 1 as Version };
};

interface KindDeclaration {
  readonly constraintName: string;
  readonly acceptedTypes: readonly string[];
  readonly acceptedModalities: readonly ReferenceModality[];
  readonly minInputs: number;
  readonly maxInputs: number;
  readonly requiresRights: boolean;
  readonly outputTypes: readonly string[];
  readonly outputCount: number;
  readonly capabilities: readonly string[];
  readonly humanParticipation: boolean;
}

/**
 * One minimal declared definition per frozen kind. These are TEST FIXTURE
 * declarations exercising the contract surface — they make no engine,
 * quality or rights claims.
 */
const KIND_DECLARATIONS: Record<TransformKind, KindDeclaration> = {
  // NO-OP/REPOST: a REAL definition with REAL constraints and ZERO capability
  // requirements — reposting requires rights context but no engine work.
  'no-op-repost': {
    constraintName: 'repost-source',
    acceptedTypes: ['video/mp4', 'audio/mpeg'],
    acceptedModalities: ['video', 'audio'],
    minInputs: 1,
    maxInputs: 1,
    requiresRights: true,
    outputTypes: ['video/mp4', 'audio/mpeg'],
    outputCount: 1,
    capabilities: [],
    humanParticipation: false,
  },
  clip: {
    constraintName: 'source-video',
    acceptedTypes: ['video/mp4'],
    acceptedModalities: ['video'],
    minInputs: 1,
    maxInputs: 1,
    requiresRights: true,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['detect_scenes', 'rank_clip_candidates'],
    humanParticipation: false,
  },
  'crop-reframe': {
    constraintName: 'source-video',
    acceptedTypes: ['video/mp4'],
    acceptedModalities: ['video'],
    minInputs: 1,
    maxInputs: 1,
    requiresRights: true,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['segment_person'],
    humanParticipation: false,
  },
  remix: {
    constraintName: 'remix-sources',
    acceptedTypes: ['video/mp4'],
    acceptedModalities: ['video'],
    minInputs: 1,
    maxInputs: 4,
    requiresRights: true,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['semantic_video_relevance', 'render_timeline'],
    humanParticipation: false,
  },
  compilation: {
    constraintName: 'compilation-sources',
    acceptedTypes: ['video/mp4'],
    acceptedModalities: ['video'],
    minInputs: 2,
    maxInputs: 12,
    requiresRights: true,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['detect_scenes', 'rank_clip_candidates', 'render_timeline'],
    humanParticipation: false,
  },
  reaction: {
    constraintName: 'reaction-inputs',
    acceptedTypes: ['video/mp4'],
    acceptedModalities: ['video'],
    minInputs: 2,
    maxInputs: 2,
    requiresRights: true,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['segment_person', 'compose_reaction', 'render_timeline'],
    humanParticipation: false,
  },
  podcast: {
    constraintName: 'podcast-sources',
    acceptedTypes: ['video/mp4', 'audio/mpeg'],
    acceptedModalities: ['video', 'audio'],
    minInputs: 1,
    maxInputs: 8,
    requiresRights: true,
    outputTypes: ['audio/mpeg'],
    outputCount: 1,
    capabilities: ['transcribe_audio', 'transcribe_video', 'generate_questions', 'generate_voice'],
    humanParticipation: false,
  },
  'translation-dubbing': {
    constraintName: 'dubbing-source',
    acceptedTypes: ['video/mp4', 'audio/mpeg'],
    acceptedModalities: ['video', 'audio'],
    minInputs: 1,
    maxInputs: 1,
    requiresRights: true,
    outputTypes: ['video/mp4', 'audio/mpeg'],
    outputCount: 1,
    capabilities: ['transcribe_audio', 'transcribe_video', 'generate_voice'],
    humanParticipation: false,
  },
  voiceover: {
    constraintName: 'voiceover-source',
    acceptedTypes: ['video/mp4'],
    acceptedModalities: ['video'],
    minInputs: 1,
    maxInputs: 1,
    requiresRights: true,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['generate_voice', 'render_timeline'],
    humanParticipation: false,
  },
  'stylization-anime': {
    constraintName: 'stylization-source',
    acceptedTypes: ['video/mp4', 'image/png'],
    acceptedModalities: ['video', 'image'],
    minInputs: 1,
    maxInputs: 1,
    requiresRights: true,
    outputTypes: ['video/mp4', 'image/png'],
    outputCount: 1,
    capabilities: ['generate_video'],
    humanParticipation: false,
  },
  // AI-GENERATED: generated purely from the declared parameterization — a
  // declared zero-input contract (minInputs 0).
  'ai-generated': {
    constraintName: 'generation-brief',
    acceptedTypes: ['text/plain'],
    acceptedModalities: ['text'],
    minInputs: 0,
    maxInputs: 0,
    requiresRights: false,
    outputTypes: ['video/mp4'],
    outputCount: 1,
    capabilities: ['generate_video'],
    humanParticipation: false,
  },
  // HUMAN CONTRIBUTION: the human IS the executor — declared human
  // participation (required for this kind) and zero ENGINE capabilities.
  'human-contribution': {
    constraintName: 'contribution-brief',
    acceptedTypes: ['video/mp4', 'audio/mpeg', 'image/png', 'text/plain'],
    acceptedModalities: ['video', 'audio', 'image', 'text'],
    minInputs: 0,
    maxInputs: 4,
    requiresRights: true,
    outputTypes: ['video/mp4', 'audio/mpeg', 'image/png', 'text/plain'],
    outputCount: 1,
    capabilities: [],
    humanParticipation: true,
  },
  hybrid: {
    constraintName: 'hybrid-inputs',
    acceptedTypes: ['video/mp4', 'audio/mpeg', 'image/png', 'text/plain'],
    acceptedModalities: ['video', 'audio', 'image', 'text'],
    minInputs: 1,
    maxInputs: 8,
    requiresRights: true,
    outputTypes: ['video/mp4', 'audio/mpeg', 'image/png', 'text/plain'],
    outputCount: 1,
    capabilities: ['compose_reaction', 'render_timeline'],
    humanParticipation: true,
  },
};

export interface DefinitionOverrides {
  readonly id?: TransformId;
  readonly constraint?: Partial<TransformInputConstraint>;
  readonly outputContract?: Partial<TransformOutputContract>;
  readonly capabilities?: readonly string[];
  readonly humanParticipation?: boolean;
}

/** Build the full definition input for one frozen kind (with optional overrides). */
export const definitionInputOf = (
  kind: TransformKind,
  tenant = 'tenant-a',
  overrides: DefinitionOverrides = {},
): TransformDefinitionInput => {
  const declaration = KIND_DECLARATIONS[kind];
  return {
    scope: scopeOf(tenant),
    id: (overrides.id ?? `transform.${kind}`) as TransformId,
    kind,
    inputConstraint: {
      name: declaration.constraintName,
      acceptedTypes: [...declaration.acceptedTypes],
      acceptedModalities: [...declaration.acceptedModalities],
      minInputs: declaration.minInputs,
      maxInputs: declaration.maxInputs,
      requiresRights: declaration.requiresRights,
      ...overrides.constraint,
    },
    outputContract: {
      outputTypes: [...declaration.outputTypes],
      outputCount: declaration.outputCount,
      ...overrides.outputContract,
    },
    parameters: { type: 'object', properties: { notes: { type: 'string' } } },
    capabilityRequirements: (overrides.capabilities ?? declaration.capabilities).map(seedCapability),
    humanParticipation: overrides.humanParticipation ?? declaration.humanParticipation,
    evaluator: `evaluator:lab-seed:${kind}@1` as never,
    costModel: {
      basis: 'per-invocation',
      amount: kind === 'no-op-repost' ? 0 : 0.01,
      currency: 'USD',
    },
    latencyModel: { p50Ms: 1000, p95Ms: 4000, p99Ms: 9000 },
    rightsRequirements:
      kind === 'no-op-repost' ? (['rights:repost-grant'] as never[]) : [],
    policyRequirements: [],
    lineageRules: ['lineage:parents-recorded'],
  };
};

/** Definition id for a kind (the fixture naming convention). */
export const definitionIdOf = (kind: TransformKind): TransformId =>
  `transform.${kind}` as TransformId;

export interface ArtifactRefOptions {
  readonly tenant?: string;
  readonly type?: string;
  readonly rightsRef?: string;
  readonly version?: number;
}

/** Build one canonical ArtifactRef fixture (full context travels with the reference). */
export const artifactRef = (id: string, options: ArtifactRefOptions = {}): ArtifactRef => {
  const tenant = options.tenant ?? 'tenant-a';
  return {
    artifactId: `art-${id}` as ArtifactRef['artifactId'],
    version: (options.version ?? 1) as Version,
    tenantId: tenant as TenantId,
    digest: `sha256:${(id + 'f'.repeat(60)).slice(0, 64).padEnd(64, '0')}` as ArtifactRef['digest'],
    type: options.type ?? 'video/mp4',
    storageRef: `mem://${tenant}/art-${id}` as ArtifactRef['storageRef'],
    rightsRef: (options.rightsRef ?? `grant-${id}`) as ArtifactRef['rightsRef'],
    provenanceRef: `prov-${id}` as ArtifactRef['provenanceRef'],
  };
};

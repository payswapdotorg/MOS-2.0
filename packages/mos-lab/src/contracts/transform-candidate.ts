import type {
  ProvenanceRef,
  TenantId,
  TenantScope,
  Timestamp,
  TransformId,
} from '@mos/contracts';
import type { CorpusId } from './corpus.js';
import type { FeatureBundleId } from './feature-bundle.js';
import type { IdeaNodeId } from './idea-graph.js';
import type { LearnedStrategyCandidateId } from './strategy-learning.js';
import type { OrganizationSearchResultId } from './organization-search.js';
import type { ProposedTransformContract } from './transform-definition.js';
import type { TransformGraphId } from './transform-graph.js';

/**
 * Transform candidate contracts for the Marketing Lab (LAB-012, §8).
 *
 * Basis: spec/mos-architecture-v2.0.md §8 (transforms may be KNOWN / COMPOSED
 * FROM KNOWN / DISCOVERED as a new candidate; a discovered transform is NOT
 * automatically production-ready — promotion requires the seven gates),
 * architecture lock rules 5 (no-op/repost first-class), 6 (transforms can be
 * atomic, composed or discovered) and 7 (discovered transforms require
 * contracts and bounded evaluation before reusable promotion), §7 (discovery
 * feeds production search), spec/mos-effective-backlog-v2.0.md LAB-012
 * (deps LAB-011 ✓ + LAB-009 ✓ + LAB-010 ✓).
 *
 * A {@link TransformCandidate} is a VERSIONED, TENANT-SCOPED, APPEND-ONLY
 * record on the §8 discovery surface:
 * - KNOWN candidates cite a registered {@link TransformDefinition} at an
 *   EXACT version (resolution over the W5-A registry);
 * - COMPOSED candidates cite a multi-node {@link TransformGraph} version as
 *   a compositional TEMPLATE — the member definitions at their exact cited
 *   versions are resolved and recorded on the candidate at proposal time;
 * - DISCOVERED candidates carry their own proposed contract PLUS derivation
 *   provenance (which corpus/ideas/features/graphs/runs produced them —
 *   LAB-003 Idea Graph references are the natural surface; mirrors the
 *   LAB-003 discipline: an empty derivation is rejected, ideas never float
 *   free of evidence).
 *
 * Promotion (the seven §8 gates) lives in transform-promotion-gates.ts and
 * transform-discovery.ts. NO AUTO-PRODUCTION (§24): a promoted candidate
 * only becomes AVAILABLE to program search — nothing deploys, nothing
 * publishes.
 */

declare const transformCandidateIdBrand: unique symbol;

/** Unique identifier of a transform candidate (stable across its versions). */
export type TransformCandidateId = string & {
  readonly [transformCandidateIdBrand]: true;
};

/** The three §8 candidate origins. */
export type TransformCandidateOrigin =
  | 'known'
  | 'composed'
  | 'discovered';

/** A KNOWN candidate's citation: a registered definition at an EXACT version. */
export interface KnownTransformCitation {
  readonly definitionId: TransformId;
  readonly definitionVersion: number;
}

/** The graph version a COMPOSED candidate cites (the compositional template). */
export interface ComposedTransformCitationInput {
  readonly graphId: TransformGraphId;
  readonly graphVersion: number;
}

/**
 * A COMPOSED candidate's citation: the cited graph version PLUS the member
 * definitions the graph's nodes cite at their EXACT versions — resolved and
 * frozen onto the candidate at proposal time, so the composition template is
 * reproducible bit-for-bit even if the graph later gains new versions.
 */
export interface ComposedTransformCitation {
  readonly graphId: TransformGraphId;
  readonly graphVersion: number;
  /** Members: one entry per graph node, in graph node order. */
  readonly members: readonly KnownTransformCitation[];
}

/**
 * The derivation provenance of a candidate — which corpus / ideas / features
 * / graphs / runs produced it (§8 gate 7 surface). DISCOVERED candidates
 * MUST carry at least one derivation reference besides the provenance
 * record (`empty-derivation`); idea references resolve against the wired
 * Idea Graph view when one is provided (LAB-003's `unknown-derivation-ref`
 * discipline).
 */
export interface TransformCandidateDerivation {
  /** LAB-003 Idea Graph nodes the candidate was derived from. */
  readonly ideaNodeIds: readonly IdeaNodeId[];
  /** LAB-002 feature bundles consulted. */
  readonly featureBundleIds: readonly FeatureBundleId[];
  /** LAB-001 corpus snapshot consulted. */
  readonly corpusId: CorpusId | null;
  readonly corpusVersion: number | null;
  /** LAB-009 learned strategy candidates that proposed this transform. */
  readonly learnedStrategyCandidateIds: readonly LearnedStrategyCandidateId[];
  /** LAB-010 organization search results that surfaced this transform. */
  readonly organizationSearchResultIds: readonly OrganizationSearchResultId[];
  /** Provenance record of the proposal step itself (non-blank). */
  readonly provenanceRef: ProvenanceRef;
}

/**
 * One immutable version of a transform candidate. Version 1 is created by
 * proposal; {@link TransformDiscoveryPort.reviseTransformCandidate} appends
 * version + 1 (full re-validation); every prior version stays resolvable
 * bit-for-bit. Promotion FREEZES an exact version (§8 gate 6).
 */
export interface TransformCandidate {
  readonly id: TransformCandidateId;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly origin: TransformCandidateOrigin;
  /** Origin citation: KNOWN → definition; COMPOSED → graph + members; DISCOVERED → null. */
  readonly citation: KnownTransformCitation | ComposedTransformCitation | null;
  /** Derivation provenance (§8 gate 7 surface; mandatory refs for discovered). */
  readonly derivation: TransformCandidateDerivation;
  /** The full registry-shaped contract the candidate proposes. */
  readonly proposedContract: ProposedTransformContract;
  /**
   * The definition id promotion materializes this candidate as — a NEW
   * registry id (register, version 1) or an EXISTING one (append-only
   * revise, version + 1). Discovery never mutates a definition in place.
   */
  readonly targetDefinitionId: TransformId;
  readonly createdAt: Timestamp;
}

/** Propose a transform candidate (version 1) on the §8 discovery surface. */
export interface ProposeTransformCandidateInput {
  readonly scope: TenantScope;
  readonly id: TransformCandidateId;
  readonly origin: TransformCandidateOrigin;
  /** Required when `origin` is `known`; must resolve at the EXACT version. */
  readonly known?: KnownTransformCitation;
  /** Required when `origin` is `composed`; the graph must resolve at the EXACT version. */
  readonly composed?: ComposedTransformCitationInput;
  /** Derivation provenance (discovered candidates: at least one reference). */
  readonly derivation: TransformCandidateDerivation;
  readonly proposedContract: ProposedTransformContract;
  readonly targetDefinitionId: TransformId;
}

/**
 * Append-only content revision of a candidate (version + 1; full
 * re-validation of origin citation, derivation and proposed contract). Gate
 * evidence recorded against earlier versions goes STALE — promotion fails
 * closed naming the gate until fresh evidence is recorded (fail-closed
 * staleness discipline).
 */
export interface ReviseTransformCandidateInput {
  readonly scope: TenantScope;
  readonly id: TransformCandidateId;
  readonly origin: TransformCandidateOrigin;
  readonly known?: KnownTransformCitation;
  readonly composed?: ComposedTransformCitationInput;
  readonly derivation: TransformCandidateDerivation;
  readonly proposedContract: ProposedTransformContract;
  readonly targetDefinitionId: TransformId;
}

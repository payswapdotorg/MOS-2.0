import type {
  ArtifactType,
  CapabilityRequirement,
  CostModel,
  EvaluatorRef,
  JsonSchemaObject,
  LatencyModel,
  PolicyRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Transform,
  TransformId,
} from '@mos/contracts';
import type { ReferenceModality } from './corpus.js';

/**
 * Transform Definition contracts for the Marketing Lab (LAB-011).
 *
 * Basis: spec/mos-architecture-v2.0.md §5 (a transform is a REQUESTED CONTENT
 * OPERATION — the thirteen frozen kinds below — and "a transform is a
 * contract, not an engine"), §6 (the artifact graph: transforms consume and
 * produce artifact nodes), §8 (transform discovery: known / composed /
 * discovered), architecture lock rules 5 (no-op/repost is a first-class
 * strategy/transform candidate) and 6 (transforms can be atomic, composed or
 * discovered), spec/contracts/core-contracts-v2.0.yaml `Transform.required`,
 * spec/mos-effective-backlog-v2.0.md LAB-011.
 *
 * A {@link TransformDefinition} is the canonical CORE-001 `Transform`
 * contract (id, version, inputTypes, outputTypes, parameters,
 * capabilityRequirements, evaluator, costModel, latencyModel,
 * rightsRequirements, policyRequirements, lineageRules) EXTENDED with the
 * lab's declared structure: the frozen {@link TransformKind}, one named
 * {@link TransformInputConstraint} (types / modality / rights / cardinality
 * as DECLARED constraints, never engine specifics), the
 * {@link TransformOutputContract} (what the transform produces) and the
 * human-participation flag (the human-contribution and hybrid kinds declare
 * it explicitly).
 *
 * DECLARATIVE ONLY — a definition declares WHAT a transform needs (capability
 * requirements as `CapabilityRequirement` refs in the `@mos/contracts`
 * vocabulary) and WHAT it produces; NO engine, agent or provider is resolved
 * or invoked here. Engines/agents satisfy the declared requirements later
 * (execution is Lab runs / production programs / the ENG runner — LAB-012
 * and LAB-016 territory).
 */

/**
 * The thirteen frozen transform kinds (architecture §5). This union is the
 * complete vocabulary — `unknown-transform-kind` is the typed failure for
 * anything else.
 */
export type TransformKind =
  | 'no-op-repost'
  | 'clip'
  | 'crop-reframe'
  | 'remix'
  | 'compilation'
  | 'reaction'
  | 'podcast'
  | 'translation-dubbing'
  | 'voiceover'
  | 'stylization-anime'
  | 'ai-generated'
  | 'human-contribution'
  | 'hybrid';

/**
 * The named, declarative constraint on the artifacts a transform accepts as
 * input. Types are matched EXACTLY against the artifact's declared type
 * (`ArtifactRef.type`, the `@mos/content` artifact vocabulary via
 * `@mos/contracts`); modality is matched against the modality derived from
 * that declared type by the documented coarse mapping in the adapter; rights
 * means the input artifacts must carry their own rights reference (rights
 * context travels WITH the reference — never inferred, spec §6/§27).
 */
export interface TransformInputConstraint {
  /** Constraint name (non-blank; cited by every validation failure it causes). */
  readonly name: string;
  /** Artifact types accepted as input (non-empty; exact match on the declared type). */
  readonly acceptedTypes: readonly ArtifactType[];
  /** Content modalities accepted (non-empty; `ReferenceModality` vocabulary). */
  readonly acceptedModalities: readonly ReferenceModality[];
  /** Minimum total input count (external artifacts + upstream outputs feeding the node). */
  readonly minInputs: number;
  /** Maximum total input count (≥ `minInputs`). */
  readonly maxInputs: number;
  /** Whether every input artifact must carry a non-blank rights reference. */
  readonly requiresRights: boolean;
}

/** The output side of the contract: what the transform is declared to produce. */
export interface TransformOutputContract {
  /** Artifact types of the produced outputs (non-empty; feeds downstream input-constraint checks). */
  readonly outputTypes: readonly ArtifactType[];
  /** Declared number of output artifacts the transform produces (≥ 1). */
  readonly outputCount: number;
}

/**
 * A VERSIONED transform definition — the canonical `Transform` core contract
 * (satisfied BY CONSTRUCTION: `inputTypes` is the sorted union of the input
 * constraint's accepted types and `outputTypes` mirrors the output contract,
 * both derived by the registry at registration) extended with the declared
 * kind, constraints and human-participation flag.
 *
 * NO-OP/REPOST IS FIRST-CLASS (lock rule 5): a `no-op-repost` definition is a
 * REAL definition with REAL constraints — and ZERO capability requirements is
 * a VALID declared state for ANY kind (the registry has no branch that
 * special-cases no-op away; the no-op seed definition simply declares none).
 */
export interface TransformDefinition extends Transform {
  readonly tenantId: TenantId;
  readonly kind: TransformKind;
  readonly inputConstraint: TransformInputConstraint;
  readonly outputContract: TransformOutputContract;
  /** Whether executing this transform requires human participation. */
  readonly humanParticipation: boolean;
  /** ISO-8601 timestamp of this definition version. */
  readonly createdAt: Timestamp;
}

/**
 * Input for registering (creates version 1) or revising (appends version + 1)
 * a transform definition. `inputTypes` / `outputTypes` are NOT supplied — the
 * registry derives them from the declared constraints so every stored record
 * satisfies the canonical `Transform` contract by construction.
 */
export interface TransformDefinitionInput {
  readonly scope: TenantScope;
  readonly id: TransformId;
  readonly kind: TransformKind;
  readonly inputConstraint: TransformInputConstraint;
  readonly outputContract: TransformOutputContract;
  /** JSON schema of the transform's declared parameter space (the searchable dimension, spec §7). */
  readonly parameters: JsonSchemaObject;
  /** Declared capability requirements (structural refs; possibly EMPTY — the no-op state). */
  readonly capabilityRequirements: readonly CapabilityRequirement[];
  readonly humanParticipation: boolean;
  readonly evaluator: EvaluatorRef;
  readonly costModel: CostModel;
  readonly latencyModel: LatencyModel;
  readonly rightsRequirements: readonly RightsRef[];
  readonly policyRequirements: readonly PolicyRef[];
  readonly lineageRules: readonly string[];
}

/**
 * The registry-shaped contract declaration a transform candidate proposes
 * (LAB-012): exactly the {@link TransformDefinitionInput} fields minus the
 * scope/id the promotion target supplies. Promotion materializes it as a
 * definition version through the registry's append-only register/revise
 * paths — so every candidate is validated by the SAME structural rules the
 * registry applies (shared validator, adapters/transform-contract-validation).
 */
export type ProposedTransformContract = Omit<TransformDefinitionInput, 'scope' | 'id'>;

/** Machine-readable failure codes for transform definition operations. */
export type TransformDefinitionErrorCode =
  | 'invalid-input'
  | 'unknown-transform-kind'
  | 'human-participation-required'
  | 'duplicate-definition'
  | 'definition-not-found';

/** Typed failure value (result union, the MOS domain convention). */
export interface TransformDefinitionError {
  readonly error: TransformDefinitionErrorCode;
  readonly message: string;
}

/**
 * The transform definition registry (LAB-011 runtime). Four public methods
 * (architecture policy budget: 12). Definitions are versioned append-only
 * records: revisions append version + 1 and prior versions stay resolvable
 * by exact (id, version); tenant-scoped, immutable, deep-frozen.
 */
export interface TransformDefinitionRegistry {
  /**
   * Register a transform definition (version 1). The kind must be one of the
   * frozen thirteen (`unknown-transform-kind`), the declared constraints must
   * be well-formed (`invalid-input`), and `human-contribution` / `hybrid`
   * kinds must declare human participation (`human-participation-required`).
   * Fails with `duplicate-definition` when the id already exists in this
   * tenant scope.
   */
  registerTransformDefinition(
    input: TransformDefinitionInput,
  ): Promise<TransformDefinition | TransformDefinitionError>;

  /**
   * Revise a transform definition (append-only: version + 1; the prior
   * version stays resolvable bit-for-bit). The full declaration is
   * re-validated. Fails with `definition-not-found` when the id does not
   * resolve in this tenant scope (unknown and cross-tenant are
   * indistinguishable — records are keyed per tenant).
   */
  reviseTransformDefinition(
    input: TransformDefinitionInput,
  ): Promise<TransformDefinition | TransformDefinitionError>;

  /**
   * Fetch a definition — latest version by default, the EXACT version when
   * given (never a silent latest fallback) — or `null` when unknown in this
   * tenant scope (unknown and cross-tenant are indistinguishable on reads).
   */
  getTransformDefinition(
    scope: TenantScope,
    id: TransformId,
    version?: number,
  ): Promise<TransformDefinition | null>;

  /**
   * The latest version of every definition in this tenant scope (insertion
   * order). Structural enumeration — discovery (LAB-012) composes over this.
   */
  listTransformDefinitions(scope: TenantScope): Promise<readonly TransformDefinition[]>;
}

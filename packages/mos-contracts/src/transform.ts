/**
 * Transform contract (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   Transform.required = [id, version, inputTypes, outputTypes, parameters,
 *     capabilityRequirements, evaluator, costModel, latencyModel,
 *     rightsRequirements, policyRequirements, lineageRules]
 *
 * Basis: spec/mos-architecture-v2.0.md §5 (a transform is a requested
 * content operation — no-op/repost, clip, crop/reframe, remix, compilation,
 * reaction, podcast, translation/dubbing, voiceover, stylization, AIGC,
 * human contribution, hybrid — and "a transform is a contract, not an
 * engine"), §8 (transform discovery).
 */

import type {
  CapabilityId,
  CostModel,
  EvaluatorRef,
  JsonSchemaObject,
  LatencyModel,
  PolicyRef,
  RightsRef,
  TransformId,
  Version,
} from "./value-types.js";

/**
 * A required capability inside a transform, pinned to an exact capability
 * contract version.
 */
export interface TransformCapabilityRequirement {
  readonly capabilityId: CapabilityId;
  readonly version: Version;
}

/**
 * A requested content operation. Transforms are engine-independent
 * contracts: the Lab/production search composes transforms into production
 * graphs, and capability requirements are resolved to concrete engines by
 * the Engine Registry at execution time.
 *
 * - `parameters`: JSON schema of the transform's parameter space (the
 *   searchable dimension, spec §7).
 * - `rightsRequirements` / `policyRequirements`: references to the rights
 *   and policy records a transform needs before it may run.
 * - `lineageRules`: identifiers of lineage rules interpreted by the
 *   artifact-graph authority (CORE-004), e.g. which parents must be
 *   recorded on outputs.
 */
export interface Transform {
  readonly id: TransformId;
  readonly version: Version;
  readonly inputTypes: readonly string[];
  readonly outputTypes: readonly string[];
  readonly parameters: JsonSchemaObject;
  readonly capabilityRequirements: readonly TransformCapabilityRequirement[];
  readonly evaluator: EvaluatorRef;
  readonly costModel: CostModel;
  readonly latencyModel: LatencyModel;
  readonly rightsRequirements: readonly RightsRef[];
  readonly policyRequirements: readonly PolicyRef[];
  readonly lineageRules: readonly string[];
}

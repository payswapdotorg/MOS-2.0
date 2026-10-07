/**
 * ProductionRequest contract (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   ProductionRequest.required = [id, version, scope, objective,
 *     sourceArtifacts, strategyRef, transformGraphRef, organizationRef,
 *     studioFormat, capabilityRequirements, humanTasks, acceptanceCriteria,
 *     budget, deadline, delayPolicy, rightsContext, returnContract]
 *
 * Basis: spec/mos-architecture-v2.0.md §7 (production search dimensions),
 * §17 (human production tasks), §18 (delay economics as a first-class
 * production strategy variable), §31 (tenant scope on mutable artifacts).
 *
 * The production module (PROD-001+) owns execution of these requests.
 */

import type {
  AcceptanceCriterion,
  AgentOrganizationId,
  Budget,
  CapabilityRequirement,
  ConsentRef,
  HumanProductionTaskId,
  JsonSchemaObject,
  Milliseconds,
  ProductionRequestId,
  RightsRef,
  StrategyRef,
  StudioFormatId,
  TenantScope,
  Timestamp,
  TransformGraphRef,
  Version,
} from "./value-types.js";
import type { ArtifactRef } from "./artifact.js";

/**
 * What to do when the acceptable wait is exceeded (spec §18: the Lab may
 * wait, retry, substitute engine/capability/provider, switch organization
 * or transform, reduce scope, proceed without human, abandon).
 */
export type DelayExceededAction =
  | "proceed-without-human"
  | "substitute"
  | "abandon";

/** Delay economics policy for one production request. */
export interface DelayPolicy {
  readonly maxWaitMs: Milliseconds;
  readonly onDelayExceeded: DelayExceededAction;
}

/**
 * The rights frame under which a production request runs: the applicable
 * rights records and consent records. Rights are never inferred from URL
 * accessibility (AGENTS.md "Media").
 */
export interface RightsContext {
  readonly rightsRefs: readonly RightsRef[];
  readonly consentRefs: readonly ConsentRef[];
}

/**
 * A request to produce a target artifact. The request names the strategy,
 * transform graph and agent organization (all versioned contracts), the
 * studio format when the Content Studio actuates the request, required
 * capabilities, planned human tasks, acceptance criteria, budget, deadline,
 * delay economics and the contract the returned artifact must satisfy.
 */
export interface ProductionRequest {
  readonly id: ProductionRequestId;
  readonly version: Version;
  readonly scope: TenantScope;
  /** Objective statement for this request. */
  readonly objective: string;
  readonly sourceArtifacts: readonly ArtifactRef[];
  readonly strategyRef: StrategyRef;
  readonly transformGraphRef: TransformGraphRef;
  readonly organizationRef: AgentOrganizationId;
  readonly studioFormat: StudioFormatId;
  readonly capabilityRequirements: readonly CapabilityRequirement[];
  readonly humanTasks: readonly HumanProductionTaskId[];
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly budget: Budget;
  readonly deadline: Timestamp;
  readonly delayPolicy: DelayPolicy;
  readonly rightsContext: RightsContext;
  /** Output contract the returned artifact must satisfy. */
  readonly returnContract: JsonSchemaObject;
}

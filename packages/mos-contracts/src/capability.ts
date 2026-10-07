/**
 * Capability contract (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   Capability.required = [id, version, inputSchema, outputSchema, evaluator,
 *     costModel, latencyModel, provenance]
 *
 * Basis: spec/mos-architecture-v2.0.md §5 (Capability = "what the system can
 * do"; capabilities are contracts, engines are replaceable implementations),
 * §10 (domain modules ask for capabilities, the Engine Registry selects
 * engines), AGENTS.md ("Capability ≠ Engine").
 *
 * CAP-001 (@mos/capabilities) builds the registry over this record.
 */

import type {
  CapabilityId,
  CostModel,
  EvaluatorRef,
  JsonSchemaObject,
  LatencyModel,
  ProvenanceRef,
  Version,
} from "./value-types.js";

/**
 * A named, versioned, engine-independent contract for something the system
 * can do.
 *
 * - `inputSchema` / `outputSchema`: JSON-schema objects describing the
 *   capability's input and output artifact shapes.
 * - `evaluator`: reference to the versioned quality evaluator contract that
 *   judges outputs of this capability.
 * - `costModel` / `latencyModel`: predictive models used by Lab production
 *   search and bottleneck economics (spec §7, §18).
 * - `provenance`: reference to the provenance record for this capability
 *   contract (who defined it, from what lineage).
 */
export interface Capability {
  readonly id: CapabilityId;
  readonly version: Version;
  readonly inputSchema: JsonSchemaObject;
  readonly outputSchema: JsonSchemaObject;
  readonly evaluator: EvaluatorRef;
  readonly costModel: CostModel;
  readonly latencyModel: LatencyModel;
  readonly provenance: ProvenanceRef;
}

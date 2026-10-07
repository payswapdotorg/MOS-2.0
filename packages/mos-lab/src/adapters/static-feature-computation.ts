import type {
  FeatureComputationPort,
  FeatureKindRequirement,
} from '../contracts/feature-bundle.js';

/**
 * Build an in-memory {@link FeatureComputationPort} — a static declaration
 * carrier for feature-kind capability requirements.
 *
 * W2-A GROUNDWORK DISCLOSURE: this is a DECLARATION-ONLY scaffold. It records
 * the capability-contract requirements per feature kind (pinned to exact
 * capability versions) and does NOTHING else: no engine is selected, invoked
 * or even resolved here. The lab asks for capabilities and resolves engines
 * through the Engine Registry (architecture §10) — an engine-backed
 * computation adapter satisfies this port in a later wave (ENG-002 seam).
 *
 * Requirements are carried verbatim, in the given order, as a frozen list;
 * the caller (composition root or test fixture) owns the mapping content.
 */
export function createStaticFeatureComputationPort(
  requirements: readonly FeatureKindRequirement[],
): FeatureComputationPort {
  const declared: readonly FeatureKindRequirement[] = Object.freeze(
    requirements.map((requirement) =>
      Object.freeze({
        kind: requirement.kind,
        capability: Object.freeze({ ...requirement.capability }),
      }),
    ),
  );
  return {
    requirements(): readonly FeatureKindRequirement[] {
      return declared;
    },
  };
}

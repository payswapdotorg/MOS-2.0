import type { ConsoleIntentsPort } from '@mos/web';
import type { CompiledStrategy } from '@mos/missions';
import {
  consoleFailureOf,
  consoleReceiptOf,
  type ConsoleBindingState,
  type RuntimeVerdict,
} from './production-agent-console-core.js';
import { missingInputFailure } from './production-agent-console-parse.js';

/**
 * The composition's DISCLOSED standard model-assignment defaults (the same
 * class as the standard agent-body catalog: capability configuration the
 * composition declares — NOT business data, and never a fabricated
 * authority claim). A plan's declared per-platform modelPreference still
 * wins for the producer role (resolveModelAssignments' own precedence);
 * these defaults fill the controller/critic/analyst roles when the
 * operator's plan declared no preferences. The model-assignment
 * administration surface (per-tenant model catalogs) arrives with the P2
 * service transport.
 */
const STANDARD_MODEL_DEFAULTS = {
  controller: 'glm-4.7',
  critic: 'glm-4.7',
  analyst: 'glm-4.7',
  producer: 'glm-4.7',
} as const;

/**
 * The run-family Console write-intent methods over the REAL PROD-003
 * compiler + PROD-004 engine (the CONSOLE wave, the entry's third
 * declare-method group):
 *
 *  - compile-strategy — the REAL StrategyCompiler.compile over the
 *    linkage-aware PlanAuthorityPort bridge (D7): the plan version resolves
 *    (0 = latest through the REAL planner's listing), the §27 compile
 *    right, the AGT-003 organization validation and the experiment-binding
 *    verification all run INSIDE the compiler; every CompilerRejection
 *    name + message is relayed VERBATIM.
 *  - create-run — the REAL AutomationEngine.createRun: the run lands in
 *    'compiled' (awaiting authorization — nothing executes).
 *  - arm-run — THE approval transition: the REAL engine.arm() with its
 *    §27 rights verdict + experiment binding. A denial is relayed with
 *    the engine's verbatim name + message; on success the run is 'armed'
 *    and the receipt's summary discloses that the enqueue-job EFFECTS the
 *    arm produced await the durable host transport (the disclosed P2
 *    boundary) — the composition does NOT execute them.
 */

/** Build the compile-strategy / create-run / arm-run declare methods. */
export function createRunIntentMethods(
  state: ConsoleBindingState,
): Pick<ConsoleIntentsPort, 'declareCompileStrategy' | 'declareCreateRun' | 'declareArmRun'> {
  const latestPlanVersionOf = async (
    planId: string,
  ): Promise<{ readonly ok: true; readonly version: number } | { readonly ok: false; readonly message: string }> => {
    const plans = await state.marketingPlanner.listMarketingPlans(state.scope);
    const latest = plans
      .filter((plan) => String(plan.id) === planId)
      .reduce<number>((max, plan) => Math.max(max, plan.version), 0);
    if (latest === 0) {
      return {
        ok: false,
        message: `the plan chain ${planId} does not exist in this tenant scope (cross-tenant ≡ unknown — no existence leak)`,
      };
    }
    return { ok: true, version: latest };
  };

  return {
    async declareCompileStrategy(declaration) {
      const identity = state.ledger.nextIdentity('compile-strategy');
      if (declaration.planId === '') {
        return state.ledger.record(
          identity,
          missingInputFailure(identity, 'planId', 'the plan chain id is required and was not carried by the declaration'),
        );
      }
      if (declaration.principalText === '') {
        return state.ledger.record(
          identity,
          missingInputFailure(identity, 'principalText', 'the principal is required and was not carried by the declaration'),
        );
      }
      const version =
        declaration.planVersion === 0
          ? await latestPlanVersionOf(declaration.planId)
          : { ok: true as const, version: declaration.planVersion };
      if (!version.ok) {
        const verdict: RuntimeVerdict = {
          error: 'marketing-plan-not-found',
          message: version.message,
        };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }

      const result = await state.strategyCompiler.compile(
        {
          planRef: { kind: 'marketing-plan', planId: declaration.planId, version: version.version },
          tenantId: String(state.scope.tenantId),
          principal: declaration.principalText,
        },
        { modelDefaults: STANDARD_MODEL_DEFAULTS },
      );
      if (!result.ok) {
        // The compiler's own names + messages, VERBATIM
        // (COMPILE_RIGHTS_DENIED, PLAN_REF_UNRESOLVED, PLAN_SHAPE_INVALID,
        // AGENTS_ORGANIZATION_REJECTED, EXPERIMENT_UNRESOLVED, ...).
        const verdict: RuntimeVerdict = { error: result.rejection.name, message: result.rejection.message };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      const strategy: CompiledStrategy = result.value;
      state.strategies.set(strategy.strategyId, strategy);
      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: strategy.strategyId,
          recordVersion: 1,
          summary:
            `strategy ${strategy.strategyId} compiled from plan ${declaration.planId}@v${version.version} — ` +
            `${strategy.organization.roles.length} roles, ${strategy.organization.delegationEdges.length} delegation edges, ` +
            `${strategy.comparators.length} comparator(s), validation receipt ${strategy.organizationValidation.authorityRecord}`,
        }),
      );
    },

    async declareCreateRun(declaration) {
      const identity = state.ledger.nextIdentity('create-run');
      if (declaration.strategyId === '') {
        return state.ledger.record(
          identity,
          missingInputFailure(identity, 'strategyId', 'the compiled strategy id is required and was not carried by the declaration'),
        );
      }
      const strategy = state.strategies.get(declaration.strategyId);
      if (strategy === undefined) {
        const verdict: RuntimeVerdict = {
          error: 'strategy-not-found',
          message: `strategy ${declaration.strategyId} does not exist in this composition's compiled-strategy records — compile it first`,
        };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      const planId = String(strategy.sourcePlan.planId);
      let sequence = 1;
      while (state.runs.has(`run-${planId}-${sequence}`)) {
        sequence += 1;
      }
      const runId = `run-${planId}-${sequence}`;
      const result = state.automationEngine.createRun(strategy, {
        runId,
        tenantId: String(state.scope.tenantId),
      });
      if (!result.ok) {
        // The engine's own names + messages, VERBATIM
        // (TENANT_ID_INVALID, RUN_TENANT_MISMATCH, ...).
        const verdict: RuntimeVerdict = { error: result.rejection.name, message: result.rejection.message };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      state.runs.set(runId, result.value);
      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: runId,
          recordVersion: 1,
          lifecycleState: result.value.lifecycle,
          summary:
            `run ${runId} created from strategy ${strategy.strategyId} in the '${result.value.lifecycle}' state — ` +
            `it waits for authorization (the arm gate); nothing executes`,
        }),
      );
    },

    async declareArmRun(declaration) {
      const identity = state.ledger.nextIdentity('arm-run');
      if (declaration.runId === '') {
        return state.ledger.record(
          identity,
          missingInputFailure(identity, 'runId', 'the run id is required and was not carried by the declaration'),
        );
      }
      if (declaration.principalText === '') {
        return state.ledger.record(
          identity,
          missingInputFailure(identity, 'principalText', 'the principal is required and was not carried by the declaration'),
        );
      }
      const run = state.runs.get(declaration.runId);
      if (run === undefined) {
        const verdict: RuntimeVerdict = {
          error: 'run-not-found',
          message: `run ${declaration.runId} does not exist in this composition's run records — create it first`,
        };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      // THE approval transition — the REAL engine's §27 rights verdict +
      // experiment-binding gate decide; rejections arrive with the
      // engine's verbatim names + messages (ARM_RIGHTS_DENIED,
      // EXPERIMENT_BINDING_FAILED, ILLEGAL_TRANSITION, ARM_AUTHORITY_FAULT).
      const result = await state.automationEngine.arm(run, {
        principal: declaration.principalText,
      });
      if (!result.ok) {
        const verdict: RuntimeVerdict = { error: result.rejection.name, message: result.rejection.message };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      const armed = result.value.state;
      state.runs.set(declaration.runId, armed);
      const experimentId =
        armed.experimentBinding === undefined ? '(none)' : armed.experimentBinding.experimentId;
      const enqueueEffects = result.value.effects.filter((effect) => effect.kind === 'enqueue-job').length;
      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: declaration.runId,
          recordVersion: armed.trail.length,
          lifecycleState: armed.lifecycle,
          summary:
            `run ${declaration.runId} armed against experiment ${experimentId} — the authorization is recorded in the run's §30 trail; ` +
            `${enqueueEffects} enqueue-job effect(s) await the durable host transport (the disclosed P2 boundary — this composition does not execute them)`,
        }),
      );
    },
  };
}

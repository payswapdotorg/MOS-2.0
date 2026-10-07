import type {
  ArtifactRef,
  HumanProductionTaskId,
  TenantScope,
  Timestamp,
} from '@mos/contracts';
import type {
  ArenaProviderPort,
} from '../contracts/arena-provider-seam.js';
import type {
  AbandonHumanTaskInput,
  DeliverHumanTaskInput,
  EvaluateHumanTaskInput,
  HumanFulfillmentPath,
  HumanTaskEvaluation,
  HumanTaskStatus,
} from '../contracts/human-task-lifecycle.js';
import type {
  CreateHumanProductionTaskInput,
  HumanProductionTaskError,
  HumanProductionTaskPort,
  LabHumanProductionTask,
} from '../contracts/human-production-task.js';
import { cloneDeep, deepFreeze, isBlankString, isPlainObject } from './parametric-support.js';
import { fulfillmentPathProblem, canonicalArtifactRefProblem, validateTaskPackage } from './human-task-field-validation.js';
import { ABANDONABLE_STATUSES, abandonTask, createHumanTaskStore, nextSubstitute } from './human-task-store.js';

/**
 * Options for {@link createInMemoryHumanProductionTask}.
 *
 * `arena` is the Arena provider port seam (LAB-014): OPTIONAL — offering a
 * task to the `arena-provider` path fails closed
 * (`arena-provider-required`) when no seam is wired; tests use the
 * DISCLOSED in-memory double. `now` is injectable for deterministic
 * timestamps (deadline expiry evaluation).
 */
export interface InMemoryHumanProductionTaskOptions {
  readonly arena?: ArenaProviderPort;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const VERDICTS: readonly string[] = [
  'accepted',
  'rejected-quality',
  'rejected-strategy',
  'treatment-requested',
];

/**
 * Build an in-memory {@link HumanProductionTaskPort} (LAB-014).
 *
 * W6-A GROUNDWORK DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). Tasks are versioned append-only — every
 * lifecycle transition appends version + 1 and prior versions stay
 * resolvable bit-for-bit; the lifecycle event log is append-only and
 * records EVERY transition and Arena interaction (switches and provider
 * outcomes are never silent). Human output is delivered as INTERMEDIATE
 * artifact references (lock rule 15 — never inline content); deadline
 * expiry uses the injectable clock. The Arena path goes through the
 * injected provider seam only (the lab never imports @mos/integrations);
 * delay economics are declared expectations, never computed here.
 */
export function createInMemoryHumanProductionTask(
  options: InMemoryHumanProductionTaskOptions = {},
): HumanProductionTaskPort {
  const now = options.now ?? nowDefault;
  const arena = options.arena;
  const store = createHumanTaskStore(now);

  const fail = (
    error: HumanProductionTaskError['error'],
    message: string,
    field?: HumanProductionTaskError['field'],
  ): HumanProductionTaskError => ({ error, message, ...(field === undefined ? {} : { field }) });

  const requireStatus = (
    current: LabHumanProductionTask,
    allowed: readonly HumanTaskStatus[],
    operation: string,
  ): HumanProductionTaskError | null => {
    if (!allowed.includes(current.status)) {
      return fail(
        'illegal-lifecycle-transition',
        `${operation} is illegal from status "${current.status}" (allowed: ${allowed.join(' | ')})`,
      );
    }
    return null;
  };

  const deliverArtifactRefsProblem = (
    scope: TenantScope,
    artifactRefs: readonly ArtifactRef[],
  ): string | null => {
    if (!Array.isArray(artifactRefs) || artifactRefs.length === 0) {
      return 'delivered artifact refs must be a non-empty array (INTERMEDIATE artifact references — never inline content)';
    }
    for (const [index, artifact] of artifactRefs.entries()) {
      const structural = canonicalArtifactRefProblem(artifact, index);
      if (structural !== null) {
        return structural;
      }
      if ((artifact as ArtifactRef).tenantId !== scope.tenantId) {
        return `delivered artifact ref #${index} must belong to the task's tenant scope — cross-tenant references fail closed`;
      }
    }
    return null;
  };

  return {
    async createHumanProductionTask(input: CreateHumanProductionTaskInput) {
      if (!isPlainObject(input) || typeof input.id !== 'string' || isBlankString(input.id)) {
        return fail('invalid-input', 'task id must be a non-blank string');
      }
      const packageProblem = validateTaskPackage(input.scope, input);
      if (packageProblem !== null) {
        return fail('invalid-task-field', packageProblem.message, packageProblem.field);
      }
      if (store.latestOf(input.scope.tenantId, input.id) !== undefined) {
        return fail('duplicate-task', `human production task already exists in this tenant scope: ${input.id}`);
      }
      const createdAt = now();
      const record = Object.freeze({
        id: input.id,
        version: 1,
        tenantId: input.scope.tenantId,
        objective: deepFreeze(cloneDeep(input.objective)),
        sourceReference: deepFreeze(cloneDeep(input.sourceReference)),
        scriptOrQuestions: deepFreeze(cloneDeep(input.scriptOrQuestions)),
        captureInstructions: deepFreeze(cloneDeep(input.captureInstructions)),
        targetModality: deepFreeze(cloneDeep(input.targetModality)),
        requiredArtifacts: deepFreeze(cloneDeep(input.requiredArtifacts)),
        consent: deepFreeze(cloneDeep(input.consent)),
        rights: deepFreeze(cloneDeep(input.rights)),
        evaluator: deepFreeze(cloneDeep(input.evaluator)),
        deadline: deepFreeze(cloneDeep(input.deadline)),
        delayEconomics: deepFreeze(cloneDeep(input.delayEconomics)),
        acceptableSubstitutes: deepFreeze(cloneDeep(input.acceptableSubstitutes)),
        status: 'created' as HumanTaskStatus,
        fulfillmentPath: null,
        deliveredArtifactRefs: null,
        evaluation: null,
        abandonment: null,
        createdAt,
        updatedAt: createdAt,
      });
      store.seed(input.scope, record);
      store.appendEvent(input.scope, input.id, {
        taskVersion: 1,
        kind: 'created',
        detail: `task created (objective: ${input.objective.statement})`,
      });
      return record;
    },

    async getHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId, version?: number) {
      return store.read(scope, taskId, version);
    },

    async listHumanProductionTasks(scope: TenantScope) {
      return store.listLatest(scope);
    },

    async offerHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId, path: HumanFulfillmentPath) {
      const current = store.latestOf(scope.tenantId, taskId);
      if (current === undefined) {
        return fail('task-not-found', `human production task does not resolve in this tenant scope: ${taskId}`);
      }
      const statusProblem = requireStatus(current, ['created'], 'offering a fulfillment path');
      if (statusProblem !== null) {
        return statusProblem;
      }
      const pathProblem = fulfillmentPathProblem(path);
      if (pathProblem !== null) {
        return fail('invalid-input', pathProblem);
      }
      if (path.kind === 'arena-provider') {
        if (arena === undefined) {
          return fail(
            'arena-provider-required',
            'offering to the arena-provider path requires the ArenaProviderPort seam — no seam is wired (the real adapter over @mos/integrations is composition-root wiring)',
          );
        }
        const offer = await arena.offerHumanProductionTask({ scope, taskId, provider: path.provider });
        if ('error' in offer) {
          store.appendEvent(scope, taskId, {
            taskVersion: current.version,
            kind: 'arena-offer-rejected',
            detail: `arena provider interaction failed: ${offer.error} — ${offer.message}`,
          });
          return fail('arena-offer-failed', `the Arena provider seam failed: ${offer.error} — ${offer.message}`);
        }
        if (!offer.accepted) {
          store.appendEvent(scope, taskId, {
            taskVersion: current.version,
            kind: 'arena-offer-rejected',
            detail: `arena provider declined the task (interaction ${offer.interactionRef})`,
            arenaOffer: Object.freeze({ ...offer }),
          });
          return fail('arena-provider-declined', `the Arena provider declined the task (interaction ${offer.interactionRef})`);
        }
        const offered = store.appendVersion(scope, current, {
          status: 'offered',
          fulfillmentPath: deepFreeze(cloneDeep(path)),
        });
        store.appendEvent(scope, taskId, {
          taskVersion: offered.version,
          kind: 'offered',
          detail: `task offered to the arena-provider path (interaction ${offer.interactionRef})`,
          arenaOffer: Object.freeze({ ...offer }),
        });
        return offered;
      }
      const offered = store.appendVersion(scope, current, {
        status: 'offered',
        fulfillmentPath: deepFreeze(cloneDeep(path)),
      });
      store.appendEvent(scope, taskId, {
        taskVersion: offered.version,
        kind: 'offered',
        detail: `task offered to the ${path.kind} path`,
      });
      return offered;
    },

    async acceptHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId) {
      const current = store.latestOf(scope.tenantId, taskId);
      if (current === undefined) {
        return fail('task-not-found', `human production task does not resolve in this tenant scope: ${taskId}`);
      }
      const statusProblem = requireStatus(current, ['offered'], 'accepting the task');
      if (statusProblem !== null) {
        return statusProblem;
      }
      const accepted = store.appendVersion(scope, current, { status: 'in-progress' });
      store.appendEvent(scope, taskId, {
        taskVersion: accepted.version,
        kind: 'accepted',
        detail: 'task accepted — in progress',
      });
      return accepted;
    },

    async deliverHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId, input: DeliverHumanTaskInput) {
      const current = store.latestOf(scope.tenantId, taskId);
      if (current === undefined) {
        return fail('task-not-found', `human production task does not resolve in this tenant scope: ${taskId}`);
      }
      const statusProblem = requireStatus(current, ['in-progress', 'evaluated'], 'delivering the human output');
      if (statusProblem !== null) {
        return statusProblem;
      }
      if (!isPlainObject(input)) {
        return fail('invalid-input', 'delivery input must be an object');
      }
      const refsProblem = deliverArtifactRefsProblem(scope, input.artifactRefs);
      if (refsProblem !== null) {
        return fail('invalid-input', refsProblem);
      }
      if (now() > current.deadline.deadlineAt) {
        return fail(
          'deadline-expired',
          `the deadline passed at ${current.deadline.deadlineAt} — deliver before the deadline or abandon (the §2 substitute/abandon loop)`,
        );
      }
      const delivered = store.appendVersion(scope, current, {
        status: 'delivered',
        deliveredArtifactRefs: deepFreeze(cloneDeep(input.artifactRefs)),
      });
      store.appendEvent(scope, taskId, {
        taskVersion: delivered.version,
        kind: 'delivered',
        detail: `human output delivered as ${String(input.artifactRefs.length)} INTERMEDIATE artifact reference(s) (lock rule 15 — never inline, never silently final)`,
        artifactRefs: deepFreeze(cloneDeep(input.artifactRefs)),
      });
      return delivered;
    },

    async evaluateHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId, input: EvaluateHumanTaskInput) {
      const current = store.latestOf(scope.tenantId, taskId);
      if (current === undefined) {
        return fail('task-not-found', `human production task does not resolve in this tenant scope: ${taskId}`);
      }
      const statusProblem = requireStatus(current, ['delivered'], 'evaluating the delivered output');
      if (statusProblem !== null) {
        return statusProblem;
      }
      if (!isPlainObject(input) || !VERDICTS.includes(input.verdict)) {
        return fail('invalid-input', `evaluation verdict must be one of ${VERDICTS.join(' | ')}`);
      }
      if (typeof input.note !== 'string' || isBlankString(input.note)) {
        return fail('invalid-input', 'evaluation note must be a non-blank string (verdicts are never silent)');
      }
      const evaluation: HumanTaskEvaluation = Object.freeze({
        verdict: input.verdict,
        note: input.note,
        evaluatedAt: now(),
      });
      const completed = input.verdict === 'accepted';
      const evaluated = store.appendVersion(scope, current, {
        status: completed ? 'completed' : 'evaluated',
        evaluation,
      });
      store.appendEvent(scope, taskId, {
        taskVersion: evaluated.version,
        kind: 'evaluated',
        detail: `delivered output evaluated: ${input.verdict}${completed ? ' — task completed' : ' (retry/treatment/abandon per the §2 loop)'}`,
        verdict: input.verdict,
      });
      return evaluated;
    },

    async abandonHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId, input: AbandonHumanTaskInput) {
      const current = store.latestOf(scope.tenantId, taskId);
      if (current === undefined) {
        return fail('task-not-found', `human production task does not resolve in this tenant scope: ${taskId}`);
      }
      const statusProblem = requireStatus(current, ABANDONABLE_STATUSES, 'abandoning the task');
      if (statusProblem !== null) {
        return statusProblem;
      }
      if (!isPlainObject(input) || typeof input.reason !== 'string' || isBlankString(input.reason)) {
        return fail('invalid-input', 'abandonment requires a non-blank reason (abandonment is first-class and never silent)');
      }
      if (input.selectSubstitute === true) {
        const substitute = nextSubstitute(current);
        if (substitute === null) {
          return fail(
            'no-substitute-available',
            'the ordered substitute list yields no untried fulfillment path — abandon plainly or extend the task package',
          );
        }
        return abandonTask(store, scope, current, 'substitute-switch', input.reason, substitute, now);
      }
      return abandonTask(store, scope, current, 'caller-decision', input.reason, null, now);
    },

    async abandonOverdueHumanProductionTask(scope: TenantScope, taskId: HumanProductionTaskId) {
      const current = store.latestOf(scope.tenantId, taskId);
      if (current === undefined) {
        return fail('task-not-found', `human production task does not resolve in this tenant scope: ${taskId}`);
      }
      const statusProblem = requireStatus(current, ABANDONABLE_STATUSES, 'abandoning the overdue task');
      if (statusProblem !== null) {
        return statusProblem;
      }
      if (now() <= current.deadline.deadlineAt) {
        return fail(
          'not-overdue',
          `the deadline is ${current.deadline.deadlineAt} and has not passed — overdue abandonment is fail-closed before expiry`,
        );
      }
      const substitute = nextSubstitute(current);
      return abandonTask(
        store,
        scope,
        current,
        'deadline-expiry',
        `deadline expired at ${current.deadline.deadlineAt} (§2/§18: waiting is a decision variable; abandonment is first-class)`,
        substitute,
        now,
      );
    },

    async listHumanProductionTaskHistory(scope: TenantScope, taskId: HumanProductionTaskId) {
      return store.history(scope, taskId);
    },
  };
}

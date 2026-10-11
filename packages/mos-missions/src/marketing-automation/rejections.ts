/**
 * PROD-003 — automation-side named typed rejections + halt intents.
 * TENANT_ID_INVALID is shared with the compiler rejection taxonomy.
 */
import type { AutomationLifecycleState, TypedHaltReason } from './types.js';
import type { TenantIdInvalid } from '../strategy-compiler/rejections.js';
import { tenantIdInvalid } from '../strategy-compiler/rejections.js';

export { tenantIdInvalid };
export type { TenantIdInvalid };

export interface ArmRightsDenied {
  readonly name: 'ARM_RIGHTS_DENIED';
  readonly message: string;
  readonly attribution: string;
  readonly authority: string;
}
export interface RunTenantMismatch {
  readonly name: 'RUN_TENANT_MISMATCH';
  readonly message: string;
  readonly strategyTenantId: string;
  readonly requestedTenantId: string;
}
export interface ExperimentBindingFailed {
  readonly name: 'EXPERIMENT_BINDING_FAILED';
  readonly message: string;
  readonly experimentId: string;
  readonly issue: string;
}
export interface IllegalTransitionRejection {
  readonly name: 'ILLEGAL_TRANSITION';
  readonly message: string;
  readonly from: AutomationLifecycleState;
  readonly to: AutomationLifecycleState;
}
export interface JobPayloadInvalid {
  readonly name: 'JOB_PAYLOAD_INVALID';
  readonly message: string;
  readonly phaseId: string;
  readonly issue: string;
}
export interface EventRunMismatch {
  readonly name: 'EVENT_RUN_MISMATCH';
  readonly message: string;
  readonly eventRunId: string;
  readonly stateRunId: string;
}
export interface EventUnknownTarget {
  readonly name: 'EVENT_UNKNOWN_TARGET';
  readonly message: string;
  readonly target: string;
  readonly detail: string;
}
export interface MaxIterationsExceeded {
  readonly name: 'HOST_LOOP_GUARD';
  readonly message: string;
  readonly iterations: number;
}
export interface ArmAuthorityFault {
  readonly name: 'ARM_AUTHORITY_FAULT';
  readonly message: string;
  readonly issue: string;
}

export type AutomationRejection =
  | ArmRightsDenied | RunTenantMismatch | ExperimentBindingFailed | IllegalTransitionRejection
  | JobPayloadInvalid | EventRunMismatch | EventUnknownTarget | TenantIdInvalid
  | MaxIterationsExceeded | ArmAuthorityFault;

export const AUTOMATION_REJECTION_NAMES = [
  'ARM_RIGHTS_DENIED', 'RUN_TENANT_MISMATCH', 'EXPERIMENT_BINDING_FAILED', 'ILLEGAL_TRANSITION',
  'JOB_PAYLOAD_INVALID', 'EVENT_RUN_MISMATCH', 'EVENT_UNKNOWN_TARGET', 'TENANT_ID_INVALID',
  'HOST_LOOP_GUARD', 'ARM_AUTHORITY_FAULT',
] as const;

const NAME_SET: ReadonlySet<string> = new Set<string>(AUTOMATION_REJECTION_NAMES);

export function isAutomationRejection(value: unknown): value is AutomationRejection {
  if (value === null || typeof value !== 'object') return false;
  const name = (value as { readonly name?: unknown }).name;
  return typeof name === 'string' && NAME_SET.has(name);
}

/** A halt intent — the engine stamps haltedAt and the ledger snapshot. */
export type HaltIntent = { readonly reason: TypedHaltReason; readonly attribution: string; readonly detail: string };

// ---------- constructors ----------
export function armRightsDenied(reason: string, attribution: string, authority: string): ArmRightsDenied {
  return { name: 'ARM_RIGHTS_DENIED', message: `run rights gate denied arming: ${reason}`, attribution, authority };
}
export function runTenantMismatch(strategyTenantId: string, requestedTenantId: string): RunTenantMismatch {
  return { name: 'RUN_TENANT_MISMATCH', message: `strategy tenant ${strategyTenantId} does not match run tenant ${requestedTenantId}`, strategyTenantId, requestedTenantId };
}
export function experimentBindingFailed(experimentId: string, issue: string): ExperimentBindingFailed {
  return { name: 'EXPERIMENT_BINDING_FAILED', message: `experiment binding failed for ${experimentId}: ${issue}`, experimentId, issue };
}
export function illegalTransition(from: AutomationLifecycleState, to: AutomationLifecycleState, detail: string): IllegalTransitionRejection {
  return { name: 'ILLEGAL_TRANSITION', message: `illegal lifecycle transition ${from} → ${to}: ${detail}`, from, to };
}
export function jobPayloadInvalid(phaseId: string, issue: string): JobPayloadInvalid {
  return { name: 'JOB_PAYLOAD_INVALID', message: `durable job payload invalid for ${phaseId}: ${issue}`, phaseId, issue };
}
export function eventRunMismatch(eventRunId: string, stateRunId: string): EventRunMismatch {
  return { name: 'EVENT_RUN_MISMATCH', message: `event addressed to run ${eventRunId} but state is run ${stateRunId}`, eventRunId, stateRunId };
}
export function eventUnknownTarget(target: string, detail: string): EventUnknownTarget {
  return { name: 'EVENT_UNKNOWN_TARGET', message: `event references unknown target ${target}: ${detail}`, target, detail };
}
export function maxIterationsExceeded(iterations: number): MaxIterationsExceeded {
  return { name: 'HOST_LOOP_GUARD', message: `host drive loop exceeded ${iterations} iterations`, iterations };
}
export function armAuthorityFault(issue: string): ArmAuthorityFault {
  return { name: 'ARM_AUTHORITY_FAULT', message: `authority fault during arming: ${issue}`, issue };
}

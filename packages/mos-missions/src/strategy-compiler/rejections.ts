/**
 * PROD-003 — compiler-side named typed rejections (mirrors the AGT-003 named-rejection
 * discipline: failures are values with stable names, never swallowed, never fabricated).
 */
export interface CompileRightsDenied {
  readonly name: 'COMPILE_RIGHTS_DENIED';
  readonly message: string;
  readonly attribution: string;
  readonly authority: string;
}
export interface PlanRefUnresolved {
  readonly name: 'PLAN_REF_UNRESOLVED';
  readonly message: string;
  readonly planId: string;
  readonly version: number;
}
export interface PlanTenantMismatch {
  readonly name: 'PLAN_TENANT_MISMATCH';
  readonly message: string;
  readonly planTenantId: string;
  readonly requestedTenantId: string;
}
export interface PlanShapeInvalid {
  readonly name: 'PLAN_SHAPE_INVALID';
  readonly message: string;
  readonly issue: string;
}
export interface IntelligenceCitationUnresolved {
  readonly name: 'INTELLIGENCE_CITATION_UNRESOLVED';
  readonly message: string;
  readonly recordId: string;
}
export interface IntelligenceAuthorityUnavailable {
  readonly name: 'INTELLIGENCE_AUTHORITY_UNAVAILABLE';
  readonly message: string;
  readonly issue: string;
}
export interface PlatformHealthNotConfirmed {
  readonly name: 'PLATFORM_HEALTH_NOT_CONFIRMED';
  readonly message: string;
  readonly platformId: string;
  readonly healthStatus: string;
}
export interface ExperimentRefUnresolved {
  readonly name: 'EXPERIMENT_REF_UNRESOLVED';
  readonly message: string;
  readonly experimentId: string;
  readonly issue: string;
}
export interface OrganizationValidationRejected {
  readonly name: 'ORGANIZATION_VALIDATION_REJECTED';
  readonly message: string;
  /** AGT-003's named rejection, carried verbatim (one of the 19). */
  readonly registryRejectionName: string;
  readonly detail: string;
  readonly authorityRecord: string;
}
export interface OrganizationSelfInvalid {
  readonly name: 'ORGANIZATION_SELF_INVALID';
  readonly message: string;
  readonly issue: string;
}
export interface ModelAssignmentMissing {
  readonly name: 'MODEL_ASSIGNMENT_MISSING';
  readonly message: string;
  readonly roleId: string;
}
export interface PlanBudgetInvalid {
  readonly name: 'PLAN_BUDGET_INVALID';
  readonly message: string;
  readonly issue: string;
}
export interface PlanDeadlineInvalid {
  readonly name: 'PLAN_DEADLINE_INVALID';
  readonly message: string;
  readonly issue: string;
}
export interface CounterfactualLabelMissing {
  readonly name: 'COUNTERFACTUAL_LABEL_MISSING';
  readonly message: string;
  readonly forecastId: string;
}
export interface TenantIdInvalid {
  readonly name: 'TENANT_ID_INVALID';
  readonly message: string;
  readonly tenantId: string;
}
export interface CompileAuthorityFault {
  readonly name: 'COMPILE_AUTHORITY_FAULT';
  readonly message: string;
  readonly issue: string;
}

export type CompilerRejection =
  | CompileRightsDenied
  | PlanRefUnresolved
  | PlanTenantMismatch
  | PlanShapeInvalid
  | IntelligenceCitationUnresolved
  | IntelligenceAuthorityUnavailable
  | PlatformHealthNotConfirmed
  | ExperimentRefUnresolved
  | OrganizationValidationRejected
  | OrganizationSelfInvalid
  | ModelAssignmentMissing
  | PlanBudgetInvalid
  | PlanDeadlineInvalid
  | CounterfactualLabelMissing
  | TenantIdInvalid
  | CompileAuthorityFault;

export const COMPILER_REJECTION_NAMES = [
  'COMPILE_RIGHTS_DENIED',
  'PLAN_REF_UNRESOLVED',
  'PLAN_TENANT_MISMATCH',
  'PLAN_SHAPE_INVALID',
  'INTELLIGENCE_CITATION_UNRESOLVED',
  'INTELLIGENCE_AUTHORITY_UNAVAILABLE',
  'PLATFORM_HEALTH_NOT_CONFIRMED',
  'EXPERIMENT_REF_UNRESOLVED',
  'ORGANIZATION_VALIDATION_REJECTED',
  'ORGANIZATION_SELF_INVALID',
  'MODEL_ASSIGNMENT_MISSING',
  'PLAN_BUDGET_INVALID',
  'PLAN_DEADLINE_INVALID',
  'COUNTERFACTUAL_LABEL_MISSING',
  'TENANT_ID_INVALID',
  'COMPILE_AUTHORITY_FAULT',
] as const;

const NAME_SET: ReadonlySet<string> = new Set<string>(COMPILER_REJECTION_NAMES);

export function isCompilerRejection(value: unknown): value is CompilerRejection {
  if (value === null || typeof value !== 'object') return false;
  const name = (value as { readonly name?: unknown }).name;
  return typeof name === 'string' && NAME_SET.has(name);
}

export function describeFault(fault: unknown): string {
  return fault instanceof Error ? fault.message : String(fault);
}

// ---------- constructors ----------
export function compileRightsDenied(reason: string, attribution: string, authority: string): CompileRightsDenied {
  return { name: 'COMPILE_RIGHTS_DENIED', message: `rights gate denied compilation: ${reason}`, attribution, authority };
}
export function planRefUnresolved(planId: string, version: number): PlanRefUnresolved {
  return { name: 'PLAN_REF_UNRESOLVED', message: `marketing plan ${planId}@v${version} did not resolve — refusing to fabricate`, planId, version };
}
export function planTenantMismatch(planTenantId: string, requestedTenantId: string): PlanTenantMismatch {
  return { name: 'PLAN_TENANT_MISMATCH', message: `plan tenant ${planTenantId} does not match request tenant ${requestedTenantId}`, planTenantId, requestedTenantId };
}
export function planShapeInvalid(issue: string): PlanShapeInvalid {
  return { name: 'PLAN_SHAPE_INVALID', message: `plan shape invalid: ${issue}`, issue };
}
export function intelligenceCitationUnresolved(recordId: string, issue: string): IntelligenceCitationUnresolved {
  return { name: 'INTELLIGENCE_CITATION_UNRESOLVED', message: `product-intelligence citation ${recordId} unresolved: ${issue}`, recordId };
}
export function intelligenceAuthorityUnavailable(issue: string): IntelligenceAuthorityUnavailable {
  return { name: 'INTELLIGENCE_AUTHORITY_UNAVAILABLE', message: `product-intelligence authority unavailable: ${issue}`, issue };
}
export function platformHealthNotConfirmed(platformId: string, healthStatus: string): PlatformHealthNotConfirmed {
  return { name: 'PLATFORM_HEALTH_NOT_CONFIRMED', message: `platform ${platformId} health is '${healthStatus}' — MARKETING-001 discipline requires provider-CONFIRMED`, platformId, healthStatus };
}
export function experimentRefUnresolved(experimentId: string, issue: string): ExperimentRefUnresolved {
  return { name: 'EXPERIMENT_REF_UNRESOLVED', message: `experiment ref ${experimentId} unresolved: ${issue}`, experimentId, issue };
}
export function organizationValidationRejected(registryRejectionName: string, detail: string, authorityRecord: string): OrganizationValidationRejected {
  return { name: 'ORGANIZATION_VALIDATION_REJECTED', message: `AGT-003 registry rejected the compiled organization: ${registryRejectionName} — ${detail}`, registryRejectionName, detail, authorityRecord };
}
export function organizationSelfInvalid(issue: string): OrganizationSelfInvalid {
  return { name: 'ORGANIZATION_SELF_INVALID', message: `compiled organization is self-inconsistent: ${issue}`, issue };
}
export function modelAssignmentMissing(roleId: string, hint: string): ModelAssignmentMissing {
  return { name: 'MODEL_ASSIGNMENT_MISSING', message: `no model assignment for role ${roleId} — refusing to fabricate one (${hint})`, roleId };
}
export function planBudgetInvalid(issue: string): PlanBudgetInvalid {
  return { name: 'PLAN_BUDGET_INVALID', message: `plan budget invalid: ${issue}`, issue };
}
export function planDeadlineInvalid(issue: string): PlanDeadlineInvalid {
  return { name: 'PLAN_DEADLINE_INVALID', message: `plan deadline invalid: ${issue}`, issue };
}
export function counterfactualLabelMissing(forecastId: string): CounterfactualLabelMissing {
  return { name: 'COUNTERFACTUAL_LABEL_MISSING', message: `forecast ${forecastId} arrived without the counterfactual label — the compiler never labels forecasts itself`, forecastId };
}
export function tenantIdInvalid(tenantId: string, detail: string): TenantIdInvalid {
  return { name: 'TENANT_ID_INVALID', message: `tenant id '${tenantId}' violates the frozen tenant-id grammar (§31): ${detail}`, tenantId };
}
export function compileAuthorityFault(issue: string): CompileAuthorityFault {
  return { name: 'COMPILE_AUTHORITY_FAULT', message: `authority fault during compilation: ${issue}`, issue };
}

export type CompilerRejectionName = CompilerRejection['name'];

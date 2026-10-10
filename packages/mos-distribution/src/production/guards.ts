/**
 * PROD-001 validation guards (caller-error shapes record nothing — AC2).
 *
 * Strict plain-object schema: unknown fields are rejected; credential-value
 * and inline-media fields carry dedicated rules so the hostile-probe classes
 * (W6-C/W10-B: forgery, aliasing, pollution, leakage) are pinned by name.
 * All validated inputs are defensively cloned: no aliasing to caller memory.
 */

import { DistributionCallerError } from './contracts.js';
import type {
  ArtifactVersionRef,
  BackoffPolicy,
  DeclaredSchedule,
  DistributionRequest,
  PolicyContextCitation,
  ProviderTarget,
  RightsContextCitation,
  TenantId,
} from './contracts.js';

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+$/;
const JOB_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;

const SECRET_KEYS: ReadonlySet<string> = new Set([
  'secret', 'secrets', 'token', 'accessToken', 'access_token', 'refreshToken',
  'refresh_token', 'password', 'passwd', 'apiKey', 'api_key', 'apiSecret',
  'api_secret', 'privateKey', 'private_key', 'clientSecret', 'client_secret',
  'credentialValue',
]);

const MEDIA_KEYS: ReadonlySet<string> = new Set([
  'media', 'inlineMedia', 'inline_media', 'bytes', 'base64', 'dataUrl',
  'data_url', 'content', 'body', 'buffer', 'blob', 'file',
]);

const RESERVED_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export /** True when any char is a C0 control code (U+0000..U+001F). */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

interface Problem {
  readonly path: string;
  readonly rule: string;
}

function checkAllowedKeys(
  obj: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
  problems: Problem[],
): void {
  for (const key of Object.keys(obj)) {
    if (RESERVED_KEYS.has(key)) {
      problems.push({ path: `${path}.${key}`, rule: 'prototype-pollution' });
      continue;
    }
    if (allowed.includes(key)) continue;
    if (SECRET_KEYS.has(key)) problems.push({ path: `${path}.${key}`, rule: 'credential-value-forbidden' });
    else if (MEDIA_KEYS.has(key)) problems.push({ path: `${path}.${key}`, rule: 'inline-media-forbidden' });
    else problems.push({ path: `${path}.${key}`, rule: 'unknown-field' });
  }
}

function requireString(
  value: unknown,
  path: string,
  rule: string,
  maxLength: number,
  problems: Problem[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || hasControlChars(value)) {
    problems.push({ path, rule });
    return undefined;
  }
  return value;
}

function requireExactVersion(value: unknown, path: string, problems: Problem[]): string | undefined {
  if (typeof value !== 'string' || !EXACT_VERSION_RE.test(value)) {
    problems.push({ path, rule: 'version-must-be-exact' });
    return undefined;
  }
  return value;
}

function validateCitation<T extends object>(
  value: unknown,
  path: string,
  field: keyof T & string,
  problems: Problem[],
): T | undefined {
  if (!isPlainRecord(value)) {
    problems.push({ path, rule: 'must-be-plain-object' });
    return undefined;
  }
  checkAllowedKeys(value, path, [field], problems);
  const ref = requireString(value[field], `${path}.${field}`, 'citation-ref-invalid', 128, problems);
  if (ref === undefined) return undefined;
  return { [field]: ref } as T;
}

export function validateDistributionRequest(raw: unknown): DistributionRequest {
  const problems: Problem[] = [];
  if (!isPlainRecord(raw)) throw new DistributionCallerError([{ path: 'request', rule: 'must-be-plain-object' }]);
  const req = raw;
  checkAllowedKeys(req, 'request',
    ['tenant', 'artifactRefs', 'targets', 'schedule', 'clientJobKey', 'rightsContext', 'policyContext', 'observabilityTrail', 'backoffPolicy'],
    problems);

  const tenant = requireString(req.tenant, 'tenant', 'tenant-id-invalid', 64, problems);

  // AC3: artifact refs at exact version; inline media impossible by schema.
  const artifactRefs: ArtifactVersionRef[] = [];
  if (!Array.isArray(req.artifactRefs) || req.artifactRefs.length === 0) {
    problems.push({ path: 'artifactRefs', rule: 'must-be-non-empty-array' });
  } else if (req.artifactRefs.length > 16) {
    problems.push({ path: 'artifactRefs', rule: 'too-many-refs' });
  } else {
    req.artifactRefs.forEach((entry: unknown, index: number) => {
      if (!isPlainRecord(entry)) {
        problems.push({ path: `artifactRefs[${index}]`, rule: 'must-be-plain-object' });
        return;
      }
      checkAllowedKeys(entry, `artifactRefs[${index}]`, ['kind', 'id', 'version'], problems);
      if (entry.kind !== 'package' && entry.kind !== 'artifact') {
        problems.push({ path: `artifactRefs[${index}].kind`, rule: 'kind-must-be-package-or-artifact' });
      }
      const id = requireString(entry.id, `artifactRefs[${index}].id`, 'id-invalid', 128, problems);
      const version = requireExactVersion(entry.version, `artifactRefs[${index}].version`, problems);
      if ((entry.kind === 'package' || entry.kind === 'artifact') && id !== undefined && version !== undefined) {
        artifactRefs.push({ kind: entry.kind, id, version });
      }
    });
  }

  // AC4: capability instances at exact version; CredentialRef handles only.
  const targets: ProviderTarget[] = [];
  if (!Array.isArray(req.targets) || req.targets.length === 0) {
    problems.push({ path: 'targets', rule: 'must-be-non-empty-array' });
  } else if (req.targets.length > 16) {
    problems.push({ path: 'targets', rule: 'too-many-targets' });
  } else {
    req.targets.forEach((entry: unknown, index: number) => {
      if (!isPlainRecord(entry)) {
        problems.push({ path: `targets[${index}]`, rule: 'must-be-plain-object' });
        return;
      }
      checkAllowedKeys(entry, `targets[${index}]`, ['capability', 'credential'], problems);
      const cap = entry.capability;
      if (!isPlainRecord(cap)) {
        problems.push({ path: `targets[${index}].capability`, rule: 'must-be-plain-object' });
        return;
      }
      checkAllowedKeys(cap, `targets[${index}].capability`,
        ['providerId', 'capability', 'instanceId', 'instanceVersion', 'channelRef', 'accountRef'], problems);
      const providerId = requireString(cap.providerId, `targets[${index}].capability.providerId`, 'provider-id-invalid', 128, problems);
      const capability = requireString(cap.capability, `targets[${index}].capability.capability`, 'capability-invalid', 128, problems);
      const instanceId = requireString(cap.instanceId, `targets[${index}].capability.instanceId`, 'instance-id-invalid', 128, problems);
      const instanceVersion = requireExactVersion(cap.instanceVersion, `targets[${index}].capability.instanceVersion`, problems);
      const channelRef = requireString(cap.channelRef, `targets[${index}].capability.channelRef`, 'channel-ref-invalid', 128, problems);
      const accountRef = requireString(cap.accountRef, `targets[${index}].capability.accountRef`, 'account-ref-invalid', 128, problems);
      const credential = entry.credential;
      if (typeof credential === 'string') {
        problems.push({ path: `targets[${index}].credential`, rule: 'credential-value-forbidden' });
        return;
      }
      if (!isPlainRecord(credential)) {
        problems.push({ path: `targets[${index}].credential`, rule: 'must-be-credential-ref' });
        return;
      }
      checkAllowedKeys(credential, `targets[${index}].credential`, ['credentialId'], problems);
      const credentialId = requireString(credential.credentialId, `targets[${index}].credential.credentialId`, 'credential-ref-invalid', 128, problems);
      if (providerId !== undefined && capability !== undefined && instanceId !== undefined &&
          instanceVersion !== undefined && channelRef !== undefined && accountRef !== undefined &&
          credentialId !== undefined) {
        targets.push({
          capability: { providerId, capability, instanceId, instanceVersion, channelRef, accountRef },
          credential: { credentialId },
        });
      }
    });
  }

  // schedule
  let schedule: DeclaredSchedule | undefined;
  if (!isPlainRecord(req.schedule)) {
    problems.push({ path: 'schedule', rule: 'must-be-plain-object' });
  } else {
    checkAllowedKeys(req.schedule, 'schedule', ['kind', 'scheduledAt'], problems);
    if (req.schedule.kind === 'immediate') {
      schedule = { kind: 'immediate' };
    } else if (req.schedule.kind === 'scheduled') {
      if (typeof req.schedule.scheduledAt !== 'string' || !Number.isFinite(Date.parse(req.schedule.scheduledAt))) {
        problems.push({ path: 'schedule.scheduledAt', rule: 'scheduled-at-must-be-iso-8601' });
      } else {
        schedule = { kind: 'scheduled', scheduledAt: req.schedule.scheduledAt };
      }
    } else {
      problems.push({ path: 'schedule.kind', rule: 'schedule-kind-invalid' });
    }
  }

  const clientJobKey = typeof req.clientJobKey === 'string' && JOB_KEY_RE.test(req.clientJobKey) ? req.clientJobKey : undefined;
  if (clientJobKey === undefined) problems.push({ path: 'clientJobKey', rule: 'client-job-key-invalid' });

  const rightsContext = validateCitation<RightsContextCitation>(req.rightsContext, 'rightsContext', 'rightsGrantRef', problems);
  const policyContext = validateCitation<PolicyContextCitation>(req.policyContext, 'policyContext', 'policyRef', problems);

  // observability trail (§30 refs from upstream chain segments)
  let recordRefs: string[] = [];
  if (!isPlainRecord(req.observabilityTrail)) {
    problems.push({ path: 'observabilityTrail', rule: 'must-be-plain-object' });
  } else {
    checkAllowedKeys(req.observabilityTrail, 'observabilityTrail', ['recordRefs'], problems);
    const refs = req.observabilityTrail.recordRefs;
    if (!Array.isArray(refs) || refs.length > 32) {
      problems.push({ path: 'observabilityTrail.recordRefs', rule: 'record-refs-invalid' });
    } else {
      const cleaned: string[] = [];
      let ok = true;
      for (const ref of refs) {
        const s = requireString(ref, 'observabilityTrail.recordRefs[]', 'record-ref-invalid', 128, problems);
        if (s === undefined) ok = false;
        else cleaned.push(s);
      }
      if (ok) recordRefs = cleaned;
    }
  }

  // optional declared backoff
  let backoffPolicy: BackoffPolicy | undefined;
  if (req.backoffPolicy !== undefined) {
    if (!isPlainRecord(req.backoffPolicy)) {
      problems.push({ path: 'backoffPolicy', rule: 'must-be-plain-object' });
    } else {
      checkAllowedKeys(req.backoffPolicy, 'backoffPolicy', ['kind', 'baseMs', 'maxAttempts'], problems);
      const baseMs = req.backoffPolicy.baseMs;
      const maxAttempts = req.backoffPolicy.maxAttempts;
      const kindOk = req.backoffPolicy.kind === 'exponential';
      const baseOk = typeof baseMs === 'number' && Number.isInteger(baseMs) && baseMs >= 1 && baseMs <= 600_000;
      const attemptsOk = typeof maxAttempts === 'number' && Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 10;
      if (!kindOk) problems.push({ path: 'backoffPolicy.kind', rule: 'backoff-kind-invalid' });
      if (!baseOk) problems.push({ path: 'backoffPolicy.baseMs', rule: 'backoff-base-ms-invalid' });
      if (!attemptsOk) problems.push({ path: 'backoffPolicy.maxAttempts', rule: 'backoff-max-attempts-invalid' });
      if (kindOk && baseOk && attemptsOk) {
        backoffPolicy = { kind: 'exponential', baseMs: baseMs as number, maxAttempts: maxAttempts as number };
      }
    }
  }

  if (problems.length > 0) throw new DistributionCallerError(problems);

  // Defensive clone: validated request never aliases caller memory (AC8).
  return {
    tenant: tenant as string,
    artifactRefs: artifactRefs.map((a) => ({ ...a })),
    targets: targets.map((t) => ({ capability: { ...t.capability }, credential: { ...t.credential } })),
    schedule: schedule as DeclaredSchedule,
    clientJobKey: clientJobKey as string,
    rightsContext: { ...(rightsContext as RightsContextCitation) },
    policyContext: { ...(policyContext as PolicyContextCitation) },
    observabilityTrail: { recordRefs: [...recordRefs] },
    ...(backoffPolicy !== undefined ? { backoffPolicy: { ...backoffPolicy } } : {}),
  };
}

export interface RetractionInput {
  readonly tenant: TenantId;
  readonly distributionId: string;
  readonly reason: string;
  readonly rightsContext: RightsContextCitation;
  readonly policyContext: PolicyContextCitation;
}

export function validateRetractionInput(raw: unknown): RetractionInput {
  const problems: Problem[] = [];
  if (!isPlainRecord(raw)) throw new DistributionCallerError([{ path: 'request', rule: 'must-be-plain-object' }]);
  checkAllowedKeys(raw, 'request', ['tenant', 'distributionId', 'reason', 'rightsContext', 'policyContext'], problems);
  const tenant = requireString(raw.tenant, 'tenant', 'tenant-id-invalid', 64, problems);
  const distributionId = requireString(raw.distributionId, 'distributionId', 'distribution-id-invalid', 128, problems);
  const reason = requireString(raw.reason, 'reason', 'reason-invalid', 512, problems);
  const rightsContext = validateCitation<RightsContextCitation>(raw.rightsContext, 'rightsContext', 'rightsGrantRef', problems);
  const policyContext = validateCitation<PolicyContextCitation>(raw.policyContext, 'policyContext', 'policyRef', problems);
  if (problems.length > 0) throw new DistributionCallerError(problems);
  return {
    tenant: tenant as string,
    distributionId: distributionId as string,
    reason: reason as string,
    rightsContext: { ...(rightsContext as RightsContextCitation) },
    policyContext: { ...(policyContext as PolicyContextCitation) },
  };
}

export interface LookupInput {
  readonly tenant: TenantId;
  readonly distributionId: string;
}

export function validateLookupInput(raw: unknown): LookupInput {
  const problems: Problem[] = [];
  if (!isPlainRecord(raw)) throw new DistributionCallerError([{ path: 'request', rule: 'must-be-plain-object' }]);
  checkAllowedKeys(raw, 'request', ['tenant', 'distributionId'], problems);
  const tenant = requireString(raw.tenant, 'tenant', 'tenant-id-invalid', 64, problems);
  const distributionId = requireString(raw.distributionId, 'distributionId', 'distribution-id-invalid', 128, problems);
  if (problems.length > 0) throw new DistributionCallerError(problems);
  return { tenant: tenant as string, distributionId: distributionId as string };
}

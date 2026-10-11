import { createHash, randomUUID } from 'node:crypto';

/** Deterministic canonical JSON: object keys sorted, no whitespace, arrays order-preserving. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    case 'boolean':
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((element) => canonicalJson(element)).join(',')}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${canonicalJson(record[key])}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      // undefined / function / symbol / bigint cannot occur in canonical payloads
      return 'null';
  }
}

/** sha-256 fingerprint over canonical JSON — the audit anchor for §24 chains and evidence. */
export function computeFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** First non-empty string among candidate keys (upstream-shape adaptation helper). */
export function pickString(record: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Clock port — injectable determinism (house pattern). */
export interface Clock {
  now(): string;
}

/** Id port — injectable determinism (house pattern). */
export interface IdGenerator {
  nextId(prefix: string): string;
}

export function systemClock(): Clock {
  return { now: (): string => new Date().toISOString() };
}

export function systemIds(): IdGenerator {
  return { nextId: (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '')}` };
}

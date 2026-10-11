/** PROD-003 — small deterministic date helpers (ISO-8601 strings everywhere). */

export function parseIso(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

export function toIso(date: Date): string {
  return date.toISOString();
}

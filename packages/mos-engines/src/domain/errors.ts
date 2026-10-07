/**
 * Engine registry errors (ENG-001) + sandbox violation errors (ENG-003) +
 * benchmark errors (ENG-004).
 *
 * Typed error classes with machine-readable `code` (string union) and a
 * structured `details` record. Fail-closed everywhere: unknown engines,
 * missing activation evidence, silent engine replacement, unbacked
 * rollbacks, sandbox violations (denied network attempts) and incomplete
 * benchmark records are errors, never silent behavior.
 */

/** Machine-readable error codes of the engine registry. */
export type EngineRegistryErrorCode =
  | "unknown-engine"
  | "engine-already-registered"
  | "invalid-engine-manifest"
  | "invalid-engine-adapter"
  | "adapter-already-registered"
  | "engine-not-activated"
  | "no-activatable-engine"
  | "silent-engine-replacement"
  | "assigned-engine-inactive"
  | "tenant-override-target-not-activated"
  | "rollback-target-not-previously-activated";

/** Typed engine registry failure. */
export class EngineRegistryError extends Error {
  readonly code: EngineRegistryErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: EngineRegistryErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "EngineRegistryError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Machine-readable codes for sandbox violations raised INSIDE an adapter
 * invocation (the network seam, the global-fetch guard). The runner
 * converts these into the job's typed EngineResult failure — the run fails
 * closed, it never crashes and never silently proceeds.
 */
export type EngineSandboxErrorCode =
  | "network-access-denied"
  | "network-host-not-granted";

/** Typed sandbox policy violation thrown by the runner's sandbox seams. */
export class EngineSandboxViolationError extends Error {
  readonly code: EngineSandboxErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: EngineSandboxErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "EngineSandboxViolationError";
    this.code = code;
    this.details = details;
  }
}

/** Machine-readable error codes of the benchmark subsystem (ENG-004). */
export type BenchmarkErrorCode =
  | "invalid-benchmark-corpus"
  | "corpus-already-registered"
  | "unknown-benchmark-corpus"
  | "benchmark-engine-not-registered"
  | "benchmark-evaluator-mismatch"
  | "benchmark-cost-currency-mismatch"
  | "incomplete-benchmark-record";

/** Typed benchmark subsystem failure. */
export class BenchmarkError extends Error {
  readonly code: BenchmarkErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: BenchmarkErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "BenchmarkError";
    this.code = code;
    this.details = details;
  }
}

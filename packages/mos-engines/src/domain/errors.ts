/**
 * Engine registry errors (ENG-001).
 *
 * One typed error class with a machine-readable `code` (string union) and
 * a structured `details` record. Fail-closed everywhere: unknown engines,
 * missing activation evidence, silent engine replacement, and unbacked
 * rollbacks are errors, never silent behavior.
 */

/** Machine-readable error codes of the engine registry. */
export type EngineRegistryErrorCode =
  | "unknown-engine"
  | "engine-already-registered"
  | "invalid-engine-manifest"
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

/**
 * Capability registry errors (CAP-001).
 *
 * Typed error classes carrying a machine-readable `code`. The registry is
 * fail-closed: unknown capabilities and invalid records are errors, never
 * silent defaults.
 */

/** Base class for capability registry failures. */
export class CapabilityRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CapabilityRegistryError";
    this.code = code;
  }
}

/** A capability (or capability version) that is not registered. */
export class UnknownCapabilityError extends CapabilityRegistryError {
  readonly capabilityId: string;
  readonly version?: number;

  constructor(capabilityId: string, version?: number) {
    super(
      "unknown-capability",
      version === undefined
        ? `Unknown capability: ${capabilityId} (no version registered)`
        : `Unknown capability: ${capabilityId} version ${version} is not registered`,
    );
    this.name = "UnknownCapabilityError";
    this.capabilityId = capabilityId;
    this.version = version;
  }
}

/** A capability id+version that is already registered (records are immutable). */
export class CapabilityAlreadyRegisteredError extends CapabilityRegistryError {
  readonly capabilityId: string;
  readonly version: number;

  constructor(capabilityId: string, version: number) {
    super(
      "capability-already-registered",
      `Capability ${capabilityId} version ${version} is already registered; capability records are immutable — register a new version instead`,
    );
    this.name = "CapabilityAlreadyRegisteredError";
    this.capabilityId = capabilityId;
    this.version = version;
  }
}

/** A capability version that does not append monotonically to the history. */
export class CapabilityVersionNotMonotonicError extends CapabilityRegistryError {
  readonly capabilityId: string;
  readonly attemptedVersion: number;
  readonly latestVersion: number;

  constructor(capabilityId: string, attemptedVersion: number, latestVersion: number) {
    super(
      "capability-version-not-monotonic",
      `Capability ${capabilityId} version ${attemptedVersion} does not append monotonically (latest registered version is ${latestVersion})`,
    );
    this.name = "CapabilityVersionNotMonotonicError";
    this.capabilityId = capabilityId;
    this.attemptedVersion = attemptedVersion;
    this.latestVersion = latestVersion;
  }
}

/** A record that does not satisfy the Capability contract's required fields. */
export class InvalidCapabilityRecordError extends CapabilityRegistryError {
  constructor(message: string) {
    super("invalid-capability-record", message);
    this.name = "InvalidCapabilityRecordError";
  }
}

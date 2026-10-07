/**
 * Agent body + agent organization registry errors (AGT-001 / AGT-003).
 *
 * Typed error classes carrying a machine-readable `code`. Both registries
 * are fail-closed: unknown bodies/organizations and invalid records are
 * errors, never silent defaults. Organization validation reports ALL named
 * rejection reasons at once (see {@link InvalidAgentOrganizationError}).
 */

/** Base class for agent registry failures. */
export class AgentRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentRegistryError";
    this.code = code;
  }
}

/** An agent body (or body version) that is not registered. */
export class UnknownAgentBodyError extends AgentRegistryError {
  readonly bodyId: string;
  readonly version?: number;

  constructor(bodyId: string, version?: number) {
    super(
      "unknown-agent-body",
      version === undefined
        ? `Unknown agent body: ${bodyId} (no version registered)`
        : `Unknown agent body: ${bodyId} version ${version} is not registered`,
    );
    this.name = "UnknownAgentBodyError";
    this.bodyId = bodyId;
    this.version = version;
  }
}

/**
 * A body registration that conflicts with the immutable version history:
 * either the id+version is already registered (`agent-body-already-registered`)
 * or the version does not append monotonically
 * (`agent-body-version-not-monotonic`).
 */
export class AgentBodyRegistrationConflictError extends AgentRegistryError {
  readonly bodyId: string;
  readonly attemptedVersion: number;
  readonly latestVersion: number;

  constructor(
    code: "agent-body-already-registered" | "agent-body-version-not-monotonic",
    message: string,
    bodyId: string,
    attemptedVersion: number,
    latestVersion: number,
  ) {
    super(code, message);
    this.name = "AgentBodyRegistrationConflictError";
    this.bodyId = bodyId;
    this.attemptedVersion = attemptedVersion;
    this.latestVersion = latestVersion;
  }
}

/**
 * A record that does not satisfy the AgentBody contract: either a missing
 * required field (validated against @mos/contracts
 * `CONTRACT_REQUIRED_FIELDS.AgentBody` — the frozen YAML authority) or a
 * semantic violation (blank identifiers, malformed budget/latency, unknown
 * capability ref, empty safety policy, ...). The message names every issue.
 */
export class InvalidAgentBodyError extends AgentRegistryError {
  constructor(message: string) {
    super("invalid-agent-body", message);
    this.name = "InvalidAgentBodyError";
  }
}

/** An agent organization (or organization version) that is not registered for the requesting tenant. */
export class UnknownAgentOrganizationError extends AgentRegistryError {
  readonly organizationId: string;
  readonly version?: number;

  constructor(organizationId: string, version?: number) {
    super(
      "unknown-agent-organization",
      version === undefined
        ? `Unknown agent organization: ${organizationId} (no version registered for this tenant)`
        : `Unknown agent organization: ${organizationId} version ${version} is not registered for this tenant`,
    );
    this.name = "UnknownAgentOrganizationError";
    this.organizationId = organizationId;
    this.version = version;
  }
}

/**
 * An organization registration that conflicts with the immutable version
 * history: either the id+version is already registered
 * (`agent-organization-already-registered`) or the version does not append
 * monotonically (`agent-organization-version-not-monotonic`).
 */
export class AgentOrganizationRegistrationConflictError extends AgentRegistryError {
  readonly organizationId: string;
  readonly attemptedVersion: number;
  readonly latestVersion: number;

  constructor(
    code: "agent-organization-already-registered" | "agent-organization-version-not-monotonic",
    message: string,
    organizationId: string,
    attemptedVersion: number,
    latestVersion: number,
  ) {
    super(code, message);
    this.name = "AgentOrganizationRegistrationConflictError";
    this.organizationId = organizationId;
    this.attemptedVersion = attemptedVersion;
    this.latestVersion = latestVersion;
  }
}

/** An organization node that is not part of the resolved organization. */
export class UnknownOrganizationNodeError extends AgentRegistryError {
  readonly organizationId: string;
  readonly nodeId: string;

  constructor(organizationId: string, nodeId: string) {
    super(
      "unknown-organization-node",
      `Organization ${organizationId} has no node with id ${nodeId}`,
    );
    this.name = "UnknownOrganizationNodeError";
    this.organizationId = organizationId;
    this.nodeId = nodeId;
  }
}

/**
 * One named rejection reason for an invalid agent organization. All reasons
 * are collected and reported together (fail-closed with named reasons).
 */
export interface OrganizationRejectionReason {
  /** Machine-readable reason code (see `OrganizationRejectionCode`). */
  readonly code: string;
  /** Human-readable detail naming the offending node/edge/field. */
  readonly detail: string;
}

/** Machine-readable codes for organization rejection reasons. */
export type OrganizationRejectionCode =
  | "missing-required-field"
  | "empty-organization"
  | "invalid-tenant-scope"
  | "duplicate-node-id"
  | "unknown-node-body"
  | "self-referencing-edge"
  | "unknown-edge-endpoint"
  | "invalid-edge-kind"
  | "delegation-cycle"
  | "duplicate-delegation"
  | "reporting-cycle"
  | "unknown-model-assignment-node"
  | "duplicate-model-assignment"
  | "missing-model-assignment"
  | "invalid-memory-policy"
  | "invalid-budget-policy"
  | "budget-per-node-exceeds-organization"
  | "invalid-termination-policy"
  | "invalid-evaluator";

/**
 * An organization record rejected by validation. Carries EVERY named reason
 * (never just the first) so callers can remediate a whole invalid org in one
 * pass. Reasons use {@link OrganizationRejectionCode} codes.
 */
export class InvalidAgentOrganizationError extends AgentRegistryError {
  readonly reasons: readonly OrganizationRejectionReason[];

  constructor(reasons: readonly OrganizationRejectionReason[]) {
    super(
      "invalid-agent-organization",
      reasons.length === 0
        ? "Invalid agent organization"
        : `Invalid agent organization: ${reasons.map((r) => `${r.code} (${r.detail})`).join("; ")}`,
    );
    this.name = "InvalidAgentOrganizationError";
    this.reasons = reasons;
  }
}

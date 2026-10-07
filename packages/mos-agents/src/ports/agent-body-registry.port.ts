/**
 * AgentBodyRegistry port (AGT-001).
 *
 * The registry of versioned, immutable AgentBody contracts. Bodies are the
 * MOS-owned reusable role/tool/permission/memory contracts (architecture §5);
 * they never pin models or runtimes (that is the AGT-002 boundary in
 * @mos/agent-runtime).
 *
 * Registry semantics (mirrors the CAP-001 capability registry):
 * - records follow the {@link AgentBody} core contract (required fields
 *   validated at registration against the frozen YAML manifest, fail-closed)
 *   plus semantic validation and capability-ref resolution;
 * - body versions are immutable: registering an existing id+version again is
 *   an error, and new versions must append monotonically;
 * - version history is preserved: every registered version stays resolvable
 *   by (id, version) — an edit to a body is a NEW version, old versions stay
 *   resolvable;
 * - unknown bodies fail closed (undefined from the getters, a typed error
 *   from {@link AgentBodyRegistryPort.require}).
 *
 * Tenant scoping: bodies are shared contract vocabulary (like capabilities),
 * so records carry no tenant scope; the registry is not tenant-partitioned.
 * Tenant scope applies to mutable organization state instead
 * (see the OrganizationRegistry port).
 */

import type { AgentBody, Version } from "@mos/contracts";

import type { AgentBodyId } from "../domain/ids.js";

/** Registry of immutable, versioned agent body contracts. 5 public methods. */
export interface AgentBodyRegistryPort {
  /**
   * Registers one immutable agent body contract record. Fail-closed: the
   * record must carry every required AgentBody field (frozen YAML manifest),
   * pass semantic validation, and resolve every capability ref through the
   * injected capability source. Duplicate id+version and non-monotonic
   * versions are rejected with typed errors. A body edit is a NEW version —
   * registered as a fresh record; old versions remain resolvable.
   */
  register(body: AgentBody): void;

  /** Resolves one exact version, or `undefined` when unknown (fail-closed). */
  get(bodyId: AgentBodyId, version: Version): AgentBody | undefined;

  /** Resolves the latest registered version, or `undefined` when unknown (fail-closed). */
  getLatest(bodyId: AgentBodyId): AgentBody | undefined;

  /**
   * Fail-closed resolution: returns the exact version (or the latest when
   * `version` is omitted) or throws
   * {@link ../errors.js!UnknownAgentBodyError} naming the body.
   */
  require(bodyId: AgentBodyId, version?: Version): AgentBody;

  /** All registered versions of one body, ascending; empty when unknown. */
  listVersions(bodyId: AgentBodyId): readonly Version[];
}

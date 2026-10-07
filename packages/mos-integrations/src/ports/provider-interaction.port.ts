/**
 * ProviderInteractionPort (INTEG-001 — the call surface).
 *
 * THE single surface through which provider interactions happen (spec §3:
 * integrations is the provider-touching authority; forbidProviderCallsOutside
 * — Lab/Studio never call providers directly). Rights gates precede
 * provider calls: every request carries a RightsContextRef and the gate
 * FAILS CLOSED without an adequate grant (unknown handles included).
 *
 * Every interaction attempt — success, typed failure or rights denial —
 * appends an immutable §30 audit record (request id, provider,
 * implementation version, capability, actor, duration, failure/warnings,
 * plus scope/instance/rights frame/verbatim status/transport source).
 * There is no unrecorded path through this port.
 *
 * Availability derivation is EXPLICIT-ONLY: listInstanceCapabilities
 * returns the instance's explicit layer-4 availability records resolved
 * through the @mos/capabilities vocabulary — an instance without a
 * capability record provides NOTHING (never the definition's declared
 * surface, never parity assumptions).
 *
 * Port files never import @zcode/* (boundary rule PORTS-NO-ZCODE).
 */

import type { TenantId } from "@mos/contracts";

import type {
  InteractionRecordFilter,
  ProviderInteractionRecord,
  ProviderInteractionRequest,
  ProviderInteractionResult,
  ResolvedInstanceCapability,
} from "../contracts/interaction.js";
import type { MerchantClientInstanceId, ProviderInteractionId } from "../contracts/ids.js";

/**
 * The provider-interaction call surface. 4 public methods (policy budget:
 * 12).
 */
export interface ProviderInteractionPort {
  /**
   * Invokes one capability through one merchant/client instance. Pipeline
   * (each stage's failure is typed, recorded §30, and terminal):
   * 1. resolve the instance IN THE CALLER'S TENANT (cross-tenant ≡
   *    unknown — no existence leaks);
   * 2. RIGHTS GATE on the presented RightsContextRef (fail-closed —
   *    denied interactions never reach the transport);
   * 3. explicit availability check: the bound implementation must carry an
   *    AvailabilityCapability record for the exact capability id + version
   *    (declared "supported" in the definition is NOT availability);
   * 4. implementation status gate: `available` proceeds, `degraded`
   *    proceeds with a warning, `unavailable` fails, `unknown` fails with
   *    its own DISTINCT code (never coerced to unavailable);
   * 5. transport seam call; the §30 record is appended either way.
   */
  invoke(request: ProviderInteractionRequest): ProviderInteractionResult;

  /**
   * The instance's EXPLICIT available capabilities, resolved through the
   * @mos/capabilities vocabulary (unresolvable refs provide nothing and
   * are not returned). Throws a typed error when the instance is unknown
   * IN THIS TENANT (cross-tenant ≡ unknown — indistinguishable).
   */
  listInstanceCapabilities(
    tenantId: TenantId,
    instanceId: MerchantClientInstanceId,
  ): readonly ResolvedInstanceCapability[];

  /**
   * Reads the §30 audit log of this tenant (ascending time order, then
   * id), optionally filtered. Tenant-scoped: records of other tenants are
   * never visible.
   */
  listInteractionRecords(tenantId: TenantId, filter?: InteractionRecordFilter): readonly ProviderInteractionRecord[];

  /** One audit record by id, or `undefined` when unknown in this tenant. */
  getInteractionRecord(tenantId: TenantId, interactionId: ProviderInteractionId): ProviderInteractionRecord | undefined;
}

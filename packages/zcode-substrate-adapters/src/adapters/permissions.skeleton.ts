/**
 * PermissionsPort adapter skeleton — DISCLOSED INTERFACE-STAGE STUB.
 *
 * MOS v2.0 (W0-B / BOOT-003). This is NOT a working adapter. The ZCode
 * permissions mechanics binding (grant/revoke/check against the substrate
 * permission runtime) is scheduled for follow-up work item AGT-001 (Agent
 * Body), which declares the tool/permission surface an agent body carries.
 * Until then this skeleton throws {@link SubstrateAdapterNotBoundError} on
 * construct and on every method. Never represent this object as a working
 * PermissionsPort.
 */

import { SubstrateAdapterNotBoundError } from "../errors.ts";
import type {
  PermissionCheckRequest,
  PermissionCheckResult,
  PermissionGrant,
  PermissionGrantRequest,
  PermissionRevokeResult,
  PermissionsPort,
} from "../ports/permissions.port.ts";

const PORT_NAME = "PermissionsPort";
const BINDING_WORK_ITEM = "AGT-001 (Agent Body)";

function notBound(): never {
  throw new SubstrateAdapterNotBoundError(
    PORT_NAME,
    BINDING_WORK_ITEM,
    "The ZCode permission grant/check binding is not implemented in W0-B; only the MOS-owned port contract ships at this stage.",
  );
}

export class UnboundPermissionsAdapter implements PermissionsPort {
  constructor() {
    notBound();
  }

  grant(_request: PermissionGrantRequest): Promise<PermissionGrant> {
    return notBound();
  }

  revoke(_grantId: string): Promise<PermissionRevokeResult> {
    return notBound();
  }

  check(_request: PermissionCheckRequest): Promise<PermissionCheckResult> {
    return notBound();
  }
}

/**
 * DISCLOSED BRIDGE-001 fixture-world identity constants (extracted from
 * bridge-fixtures.ts — the file-length policy, behavior-identical): the one
 * fixture tenant/scope/actor and the canonical refs the search world, the
 * studio composition and the entry-request builder share. All DATA — no real
 * tenant, mission, policy rule, grant or consent is implied.
 */

import type {
  ConsentRef,
  IdentityRef,
  MissionRef,
  PolicyRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
} from "@mos/contracts";

/** The one bridge fixture tenant. */
export const BRIDGE_TENANT = "tenant-bridge-001" as TenantId;
/** The bridge fixture scope (§31). */
export const BRIDGE_SCOPE: TenantScope = { tenantId: BRIDGE_TENANT };
/** The §30 actor entering candidates into production. */
export const BRIDGE_ACTOR = "identity-bridge-operator-1" as IdentityRef;
/** The mission the fixture search cites (§24 Mission segment). */
export const BRIDGE_MISSION_REF = "mission:bridge-fixture-growth" as MissionRef;
/** The policy rule the entry requests cite (the caller's declared set). */
export const BRIDGE_POLICY_REF = "policy:bridge-fixture-production" as PolicyRef;
/** The rights grant ref the fixture rights frame cites (§27). */
export const BRIDGE_RIGHTS_REF = "rights:bridge-source-grant" as RightsRef;
/** The consent ref the fixture rights frame cites. */
export const BRIDGE_CONSENT_REF = "consent:bridge-producer-1" as ConsentRef;

/** A fixed "now" for the deterministic fixture search world. */
export const BRIDGE_NOW = (): Timestamp => "2026-06-01T00:00:00.000Z" as Timestamp;

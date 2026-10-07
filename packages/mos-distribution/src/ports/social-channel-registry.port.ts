/**
 * SocialChannelRegistry port (SOCIAL-001).
 *
 * Registry of versioned, tenant-scoped social channels — the tenant's
 * DECLARED distribution surfaces on social platforms, each carrying its
 * capability matrix and its INTEGRATIONS binding. Port files never import
 * @zcode/* (boundary rule) and carry NO provider specifics: platform
 * identity is record DATA (provider-neutral contracts only, test-pinned).
 *
 * Registry semantics (the INTEG-001 registry discipline):
 * - records are immutable versioned snapshots, keyed per (tenant, id):
 *   registering with a fresh id starts version 1; registering with an id
 *   that exists IN THE SAME TENANT appends the next version (append-only
 *   corrections — a corrected capability matrix is a NEW version; prior
 *   versions stay resolvable). A same-id record in ANOTHER tenant is an
 *   independent record — tenant-scoped ids are not globally unique;
 * - every accessor takes the tenant scope: cross-tenant lookups are
 *   indistinguishable from unknown ones (undefined / empty — §31 no
 *   existence leaks);
 * - registration is fail-closed: full required-field validation, closed
 *   vocabularies (operations, presentation kinds, support levels), strict
 *   shape, duplicate matrix entries rejected, duplicate channel names in
 *   the tenant rejected, and the referenced integrations instance must
 *   resolve IN THE SAME TENANT (the injected
 *   MerchantClientInstanceRegistryPort of @mos/integrations — the link is
 *   validated, never assumed);
 * - channels NEVER carry credentials (there is no such field — the
 *   credential handle stays behind the integrations instanceRef).
 */

import type { SocialChannel, RegisterSocialChannelInput } from "../contracts/social-channel.js";
import type { SocialChannelId } from "../contracts/ids.js";
import type { TenantId, Version } from "@mos/contracts";

/** Registry of social channels. 5 public methods (policy budget: 12). */
export interface SocialChannelRegistryPort {
  /**
   * Registers one immutable channel snapshot (append-only versioning —
   * see module docblock). Fail-closed validation; returns the frozen
   * stored record.
   */
  register(input: RegisterSocialChannelInput): SocialChannel;

  /**
   * Resolves one exact version, or `undefined` when the channel is
   * unknown IN THIS TENANT (cross-tenant ≡ unknown — no existence leaks).
   */
  get(tenantId: TenantId, channelId: SocialChannelId, version: Version): SocialChannel | undefined;

  /** Latest version, or `undefined` when unknown in this tenant. */
  getLatest(tenantId: TenantId, channelId: SocialChannelId): SocialChannel | undefined;

  /** All versions of one channel, ascending; empty when unknown. */
  listVersions(tenantId: TenantId, channelId: SocialChannelId): readonly Version[];

  /** All channel ids registered in this tenant (insertion order). */
  listForTenant(tenantId: TenantId): readonly SocialChannelId[];
}

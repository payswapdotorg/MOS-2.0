/**
 * REAL participant authorities composed at the studio testing seam
 * (STUDIO-006).
 *
 * This module constructs the REAL `@mos/identity` in-memory repository and
 * the REAL `@mos/rights` in-memory repository and wires them into the
 * studio-owned ports through the REAL adapters
 * (participant-authority-adapters.ts). Identity and rights remain the
 * authorities; every participant admission/consent decision the runtime
 * makes is answered by these real repositories.
 *
 * RUNTIME IMPORT DISCLOSURE: the sibling packages' `exports` maps point the
 * runtime condition at untranspiled `src/index.ts` (their own documented
 * composition-root convention), which plain Node ESM cannot execute because
 * internal specifiers are compiled-style `.js`. The composition here imports
 * the packages' BUILT PUBLIC ENTRYPOINTS
 * (`packages/mos-identity/dist/index.js`,
 * `packages/mos-rights/dist/index.js`) by relative path — the same public
 * surface the bare `@mos/identity` / `@mos/rights` specifiers resolve to
 * after `tsc -b` (project references guarantee the build order). When the
 * sibling exports maps are reconciled, these two specifiers change to the
 * bare package names and NOTHING else moves: the ports, adapters and tests
 * are already written against the real types.
 */

import { createInMemoryIdentityRepository } from "../../../mos-identity/dist/index.js";
import { createInMemoryRightsRepository } from "../../../mos-rights/dist/index.js";
import type {
  IdentityRepository,
  Membership,
  TenantScope,
} from "@mos/identity";
import type { ConsentRef as RightsConsentRef, RightsAction, RightsRepository } from "@mos/rights";

import { createParticipantIdentityPortFromRepository } from "./participant-authority-adapters.js";
import { createParticipantConsentPortFromRightsRepository } from "./participant-authority-adapters.js";
import { bridge } from "./participant-authority-adapters.js";
import type { ParticipantIdentityPort } from "../ports/participant-identity.js";
import type { ParticipantConsentPort } from "../ports/participant-consent.js";
import { studioSessionConsentSubject } from "../ports/participant-consent.js";
import type { ConsentRef, IdentityRef, StudioSessionId, TenantId } from "../contracts/refs.js";

/** Options for {@link composeRealParticipantAuthorities}. */
export interface RealParticipantAuthoritiesOptions {
  /** Injectable clock for the rights repository (deterministic tests). */
  readonly now?: () => string;
}

/** The composed REAL authorities + studio ports + test seeding helpers. */
export interface RealParticipantAuthorities {
  readonly identityRepository: IdentityRepository;
  readonly rightsRepository: RightsRepository;
  readonly participantIdentityPort: ParticipantIdentityPort;
  readonly participantConsentPort: ParticipantConsentPort;
  /**
   * Ensure the tenant, one workspace, the identity principal and an ACTIVE
   * membership exist (idempotent; §15 authorization basis for joining).
   */
  ensureIdentity(input: {
    readonly tenantId: TenantId;
    readonly identityRef: IdentityRef;
    readonly displayName?: string;
  }): readonly Membership[];
  /**
   * Record a REAL session-scoped consent for one participant and return its
   * canonical ConsentRef. Actions default to the full studio gate pair.
   */
  recordSessionConsent(input: {
    readonly tenantId: TenantId;
    readonly identityRef: IdentityRef;
    readonly sessionId: StudioSessionId;
    readonly actions?: readonly RightsAction[];
    readonly purpose?: string;
  }): ConsentRef;
  /** Revoke a consent (append-only, real rights authority). */
  revokeSessionConsent(tenantId: TenantId, ref: ConsentRef): void;
}

/**
 * Compose the REAL identity + rights authorities behind the studio ports.
 * NOT a production composition root — production binds durable repositories
 * through the same adapters at the TL integration point.
 */
export function composeRealParticipantAuthorities(
  options: RealParticipantAuthoritiesOptions = {},
): RealParticipantAuthorities {
  const identityRepository = createInMemoryIdentityRepository();
  const rightsRepository = createInMemoryRightsRepository({ now: options.now });
  const participantIdentityPort = createParticipantIdentityPortFromRepository(identityRepository);
  const participantConsentPort = createParticipantConsentPortFromRightsRepository(rightsRepository);

  const tenants = new Set<string>();
  const identities = new Set<string>();
  const workspaces = new Map<string, Set<string>>();
  let membershipCounter = 0;
  let consentCounter = 0;
  const WORKSPACE_ID = "ws-studio-main" as const;

  const brandTenant = (tenantId: TenantId): Parameters<IdentityRepository["createTenant"]>[0]["id"] =>
    bridge<Parameters<IdentityRepository["createTenant"]>[0]["id"]>(tenantId);

  return {
    identityRepository,
    rightsRepository,
    participantIdentityPort,
    participantConsentPort,
    ensureIdentity({ tenantId, identityRef, displayName }) {
      if (!tenants.has(String(tenantId))) {
        identityRepository.createTenant({ id: brandTenant(tenantId), name: `tenant-${String(tenantId)}` });
        identityRepository.createWorkspace({
          scope: { tenantId: brandTenant(tenantId) },
          id: WORKSPACE_ID as never,
          name: "studio-main",
        });
        tenants.add(String(tenantId));
        workspaces.set(String(tenantId), new Set([WORKSPACE_ID]));
      }
      if (!identities.has(String(identityRef))) {
        identityRepository.upsertIdentity({
          id: String(identityRef) as never,
          displayName: displayName ?? `participant-${String(identityRef)}`,
          kind: "user",
        });
        identities.add(String(identityRef));
      }
      const granted = identityRepository.grantMembership({
        scope: { tenantId: brandTenant(tenantId) },
        id: `mbrs_${++membershipCounter}` as never,
        workspaceId: WORKSPACE_ID as never,
        identityId: String(identityRef) as never,
        role: "collaborator",
      });
      // A duplicate active membership is a repository rejection; tests reuse
      // the listMemberships read instead.
      const scope = {
        tenantId: brandTenant(tenantId),
        workspaceId: WORKSPACE_ID as never,
      };
      return "error" in granted
        ? identityRepository.listMemberships(scope).filter((m) => String(m.identityId) === String(identityRef))
        : [granted];
    },
    recordSessionConsent({ tenantId, identityRef, sessionId, actions, purpose }) {
      const ref = bridge<RightsConsentRef>(`consent-${++consentCounter}`);
      const recorded = rightsRepository.recordConsent({
        scope: bridge<TenantScope>({ tenantId: String(tenantId) }),
        id: ref,
        participantRef: bridge<never>(String(identityRef)),
        purpose: purpose ?? `studio session ${String(sessionId)}`,
        actions: actions ?? ["use", "transform"],
        subjectRefs: [studioSessionConsentSubject(sessionId)],
      });
      if ("error" in recorded) {
        throw new Error(`real rights repository rejected the seeded consent: ${recorded.message}`);
      }
      return bridge<ConsentRef>(ref);
    },
    revokeSessionConsent(tenantId, ref) {
      const revoked = rightsRepository.revokeConsent(
        bridge<TenantScope>({ tenantId: String(tenantId) }),
        bridge<RightsConsentRef>(ref),
      );
      if ("error" in revoked) {
        throw new Error(`real rights repository rejected the consent revocation: ${revoked.message}`);
      }
    },
  };
}

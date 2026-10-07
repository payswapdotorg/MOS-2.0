/**
 * REAL participant-authority adapters (STUDIO-006) — studio testing seam.
 *
 * These adapters compose the REAL packages' repositories:
 * - `createParticipantIdentityPortFromRepository` calls the REAL
 *   `@mos/identity` `IdentityRepository` (getIdentity, listWorkspaces,
 *   listMemberships);
 * - `createParticipantConsentPortFromRightsRepository` calls the REAL
 *   `@mos/rights` `RightsRepository` (getConsent).
 *
 * The identity/rights packages remain the AUTHORITIES; the Studio only
 * consumes their ports (no second authority: the adapters translate, they
 * never invent identities, memberships, grants or consent semantics).
 *
 * BRAND BRIDGE (disclosed): @mos/identity and @mos/rights brand their ids
 * with package-local compile-time brands (their own reconciliation waves),
 * while the Studio speaks the canonical `@mos/contracts` brands. The
 * `bridge` casts below are compile-time only — at runtime every id is the
 * same plain string the caller produced — and they disappear when the
 * sibling packages import the canonical branded ids themselves.
 */

import type {
  IdentityId as IdentityPackageIdentityId,
  IdentityRepository,
  Membership,
  TenantScope as IdentityTenantScope,
  WorkspaceScope,
} from "@mos/identity";
import type { ConsentRef as RightsConsentRef, ConsentRecord, RightsRepository } from "@mos/rights";

import type {
  ParticipantIdentityPort,
  ParticipantIdentityResolution,
} from "../ports/participant-identity.js";
import type {
  ParticipantConsentPort,
  ParticipantConsentResolution,
} from "../ports/participant-consent.js";
import {
  STUDIO_CONSENT_CAPTURE_ACTION,
  STUDIO_CONSENT_PROCESSING_ACTION,
  studioSessionConsentSubject,
} from "../ports/participant-consent.js";

/**
 * Compile-time BRAND BRIDGE (disclosed): `@mos/identity` / `@mos/rights`
 * brand their ids with package-local compile-time brands (their own
 * reconciliation waves), while the Studio speaks the canonical
 * `@mos/contracts` brands. Every id is the same plain string at runtime —
 * the bridge below is a type-level double cast that performs NO runtime
 * conversion and disappears when the sibling packages adopt the canonical
 * branded ids themselves.
 */
export const bridge = <T>(value: unknown): T => value as T;

/**
 * Build the studio participant-identity port over a REAL identity
 * repository. Active memberships are collected across the tenant's
 * workspaces (identity → membership is the §15 authorization basis).
 */
export function createParticipantIdentityPortFromRepository(
  repository: IdentityRepository,
): ParticipantIdentityPort {
  return {
    async resolveParticipantIdentity(query): Promise<ParticipantIdentityResolution> {
      const identityId = bridge<IdentityPackageIdentityId>(query.identityRef);
      const identity = repository.getIdentity(identityId);
      const activeMemberships: Membership[] = [];
      if (identity !== null) {
        const tenantScope = bridge<IdentityTenantScope>({ tenantId: query.tenantId });
        for (const workspace of repository.listWorkspaces(tenantScope)) {
          const workspaceScope = bridge<WorkspaceScope>({
            tenantId: query.tenantId,
            workspaceId: workspace.id,
          });
          for (const membership of repository.listMemberships(workspaceScope)) {
            const sameIdentity = membership.identityId === identityId;
            if (sameIdentity && membership.revokedAt === null) {
              activeMemberships.push(membership);
            }
          }
        }
      }
      return { identityRef: query.identityRef, identity, activeMemberships };
    },
  };
}

/** Does one REAL consent record cover the queried participant's session? */
function coversParticipantSession(
  record: ConsentRecord,
  query: { readonly tenantId: string; readonly sessionId: string; readonly participantIdentityRef: string },
): boolean {
  if (record.revokedAt !== null) {
    return false; // append-only revocation: the record is no longer active
  }
  if (String(record.tenantId) !== query.tenantId) {
    return false; // consent is tenant-scoped
  }
  if (String(record.participantRef) !== query.participantIdentityRef) {
    return false; // consent belongs to a DIFFERENT participant (never pooled)
  }
  return record.scope.subjectRefs.includes(query.sessionId);
}

/**
 * Build the studio participant-consent port over a REAL rights repository.
 * The derived gate verdicts follow the documented convention in
 * ports/participant-consent.ts (session subject + `use`/`transform` actions).
 */
export function createParticipantConsentPortFromRightsRepository(
  repository: RightsRepository,
): ParticipantConsentPort {
  return {
    async resolveParticipantConsent(query): Promise<ParticipantConsentResolution> {
      const subject = studioSessionConsentSubject(query.sessionId);
      let activeSessionConsentCount = 0;
      let coversCapture = false;
      let coversProcessingIntoArtifacts = false;
      for (const ref of query.consentRefs) {
        const record = repository.getConsent(bridge<RightsConsentRef>(ref));
        if (record === null) {
          continue; // unknown ref: contributes nothing (explicit, never guessed)
        }
        const scoped = coversParticipantSession(record, {
          tenantId: String(query.tenantId),
          sessionId: subject,
          participantIdentityRef: String(query.participantIdentityRef),
        });
        if (!scoped) {
          continue;
        }
        activeSessionConsentCount += 1;
        if (record.scope.actions.includes(STUDIO_CONSENT_CAPTURE_ACTION)) {
          coversCapture = true;
        }
        if (record.scope.actions.includes(STUDIO_CONSENT_PROCESSING_ACTION)) {
          coversProcessingIntoArtifacts = true;
        }
      }
      return {
        participantIdentityRef: query.participantIdentityRef,
        consentRefs: [...query.consentRefs],
        activeSessionConsentCount,
        coversCapture,
        coversProcessingIntoArtifacts,
      };
    },
  };
}

import type { StudioSessionSummaryRecord } from '@mos/studio';
import type { TenantId } from '@mos/contracts';
import { packageRef, sessionRef, ts } from './studio-fixture-builders.js';

/**
 * REAL-shape session-summary fixtures (UX-002) — the STUDIO-014
 * session-directory observation records the disclosed composition double
 * lists. Every §13 lifecycle state is represented (honest variety), plus one
 * cross-tenant session that must never leak into the demo scope (§31).
 * Type-only `@mos/studio` imports (erased at runtime).
 */

export const DEMO_TENANT = 'tenant-demo' as TenantId;
export const OTHER_TENANT = 'tenant-operator-other' as TenantId;

const summary = (
  sessionId: string,
  formatId: string,
  lifecycleState: string,
  createdAt: string,
  participantCount: number,
  organizationRef: { readonly id: string; readonly version: number },
  artifactPackage: { readonly packageId: string; readonly version: number } | null,
  tenantId: TenantId = DEMO_TENANT,
): StudioSessionSummaryRecord =>
  Object.freeze({
    sessionRef: sessionRef(sessionId),
    tenantId,
    formatId,
    formatVersion: 1,
    lifecycleState,
    createdAt: ts(createdAt),
    participantCount,
    organizationRef,
    artifactPackageRef:
      artifactPackage === null
        ? null
        : { packageId: packageRef(artifactPackage.packageId), version: artifactPackage.version },
  });

const REACTION_DESK = { id: 'org-reaction-desk', version: 3 } as const;
const PODCAST_DESK = { id: 'org-podcast-desk', version: 2 } as const;

export const FIXTURE_SESSION_SUMMARIES: readonly StudioSessionSummaryRecord[] = Object.freeze([
  summary('session-reaction-1', 'reaction', 'packaged', '2026-06-02T09:00:00.000Z', 2, REACTION_DESK, {
    packageId: 'pkg-reaction-1',
    version: 2,
  }),
  summary('session-podcast-1', 'audio-podcast', 'review', '2026-06-03T10:30:00.000Z', 2, PODCAST_DESK, null),
  summary('session-video-1', 'video-podcast', 'capturing', '2026-06-04T08:15:00.000Z', 2, PODCAST_DESK, null),
  summary('session-reaction-2', 'reaction', 'processing', '2026-06-05T11:00:00.000Z', 1, REACTION_DESK, null),
  summary('session-podcast-2', 'audio-podcast', 'loading', '2026-06-05T13:45:00.000Z', 0, PODCAST_DESK, null),
  summary('session-reaction-3', 'reaction', 'requested', '2026-06-06T09:20:00.000Z', 0, REACTION_DESK, null),
  summary('session-podcast-3', 'audio-podcast', 'closed', '2026-05-28T14:00:00.000Z', 1, { id: 'org-podcast-desk', version: 1 }, {
    packageId: 'pkg-podcast-3',
    version: 1,
  }),
  summary('session-reaction-4', 'reaction', 'review', '2026-06-01T16:40:00.000Z', 1, REACTION_DESK, null),
  summary('session-podcast-4', 'audio-podcast', 'abandoned', '2026-05-30T09:10:00.000Z', 1, PODCAST_DESK, null),
  summary('session-reaction-5', 'reaction', 'failed', '2026-05-29T10:00:00.000Z', 1, { id: 'org-reaction-desk', version: 2 }, null),
  summary('session-podcast-5', 'video-podcast', 'failed', '2026-05-27T15:25:00.000Z', 2, { id: 'org-podcast-desk', version: 1 }, null),
  // Cross-tenant (§31): never listed for the demo scope.
  summary('session-other-1', 'reaction', 'packaged', '2026-06-02T09:00:00.000Z', 1, REACTION_DESK, {
    packageId: 'pkg-other-1',
    version: 1,
  }, OTHER_TENANT),
]);

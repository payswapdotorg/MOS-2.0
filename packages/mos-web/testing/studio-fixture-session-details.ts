import type { StudioArtifactRef } from '@mos/studio';
import type { StudioSessionDetailSource } from './studio-shape-adapter.js';
import { DEMO_TENANT, FIXTURE_SESSION_SUMMARIES } from './studio-fixture-sessions.js';
import {
  LAB_ACTOR,
  OPERATOR_ACTOR,
  STANDALONE_USER_ACTOR,
  T,
  artifact,
  review,
} from './studio-fixture-builders.js';

/**
 * REAL-shape session-detail fixtures (UX-002) — the §15 multi-account
 * participants (identity/account/roles/consent, granted + PENDING variety),
 * the append-only lifecycle histories, the §30-attributable review records
 * (quality vs rights/policy rejections distinct), and the §15 live
 * re-resolution outcomes (one revoked imported-source holder → the typed
 * consent-required verdict; the refused operator action left NO review —
 * fail-closed honesty). Type-only `@mos/studio` imports (erased at runtime).
 */

const P = (
  participantId: string,
  identityRef: string,
  accountRef: string,
  roles: readonly string[],
  consentRefs: readonly string[],
  coversCapture = true,
  coversProcessingIntoArtifacts = true,
): StudioSessionDetailSource['participants'][number] => ({
  participantId,
  identityRef,
  accountRef,
  roles,
  consentRefs,
  coversCapture,
  coversProcessingIntoArtifacts,
});

const CE = (
  artifactId: string,
  holderIdentityRef: string,
  consentRefs: readonly string[],
): StudioSessionDetailSource['consentEntries'][number] => ({
  artifactId,
  consentRefs: consentRefs as never,
  holderIdentityRef: holderIdentityRef as never,
});

const HR = (
  holderIdentityRef: string,
  coversProcessingIntoArtifacts: boolean,
): StudioSessionDetailSource['holderResolutions'][number] => ({
  holderIdentityRef,
  coversProcessingIntoArtifacts,
});

const F = (stage: string, storageRef: string, method: StudioArtifactRef['creationMethod'], parents: readonly StudioArtifactRef[] = []) =>
  artifact({
    artifactId: `final-${storageRef}`,
    version: 1,
    tenantId: DEMO_TENANT,
    type: storageRef.includes('podcast-5') || storageRef.includes('reaction') ? 'video' : 'audio',
    stage: stage as never,
    creationMethod: method,
    storageRef: `final/${storageRef}`,
    parents,
  });

const DETAIL_REACTION_1_FINAL = F('final', 'reaction-pip-1', 'composition');
const DETAIL_PODCAST_3_FINAL = F('final', 'podcast-episode-1', 'composition');
const DETAIL_REACTION_5_FINAL = F('final', 'reaction-5-candidate', 'composition');
const DETAIL_PODCAST_5_FINAL = F('final', 'podcast-5-candidate', 'composition');

const lifecycle = (state: string, transitions: ReturnType<typeof T>[]) => ({
  state: state as never,
  transitions,
});

export const FIXTURE_SESSION_DETAILS: ReadonlyMap<string, StudioSessionDetailSource> = new Map(
  Object.entries({
    'session-reaction-1': {
      summary: FIXTURE_SESSION_SUMMARIES[0] as never,
      lifecycle: lifecycle('packaged', [
        T('requested', 'loading', '2026-06-02T09:00:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-06-02T09:00:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-06-02T09:12:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-06-02T10:10:00.000Z', 'processing-completed'),
        T('review', 'packaged', '2026-06-02T10:12:00.000Z', 'review-accepted'),
      ]),
      participants: [
        P('participant-operator-1', 'identity-operator-1', 'account-op-main', ['operator'], ['consent-101']),
        P('participant-reactor-1', 'identity-user-1', 'account-user-media', ['subject'], ['consent-102', 'consent-103']),
      ],
      reviews: [
        review({
          sessionId: 'session-reaction-1',
          target: DETAIL_REACTION_1_FINAL,
          outcome: 'accept',
          decidedBy: OPERATOR_ACTOR,
          decidedAt: '2026-06-02T10:11:30.000Z',
        }),
      ],
      consentEntries: [CE('raw-reaction-cam-1', 'identity-user-1', ['consent-102', 'consent-103']), CE('raw-source-import-1', 'identity-source-holder-1', ['consent-104'])],
      holderResolutions: [HR('identity-user-1', true), HR('identity-source-holder-1', true)],
    },
    'session-podcast-1': {
      summary: FIXTURE_SESSION_SUMMARIES[1] as never,
      lifecycle: lifecycle('review', [
        T('requested', 'loading', '2026-06-03T10:30:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-06-03T10:30:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-06-03T11:05:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-06-03T12:00:00.000Z', 'processing-completed'),
      ]),
      participants: [
        P('participant-host-1', 'identity-user-2', 'account-user-media', ['interviewer', 'subject'], ['consent-201', 'consent-202']),
        // §15 multi-account guest: refs recorded, coverage NOT yet complete —
        // the session waits on consent (PENDING).
        P('participant-guest-1', 'identity-user-3', 'account-guest-phone', ['subject'], ['consent-203'], true, false),
      ],
      reviews: [],
      consentEntries: [CE('raw-podcast-mic-1', 'identity-user-2', ['consent-201', 'consent-202']), CE('raw-podcast-mic-2', 'identity-user-3', ['consent-203'])],
      holderResolutions: [HR('identity-user-2', true), HR('identity-user-3', true)],
    },
    'session-video-1': {
      summary: FIXTURE_SESSION_SUMMARIES[2] as never,
      lifecycle: lifecycle('capturing', [
        T('requested', 'loading', '2026-06-04T08:15:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-06-04T08:15:06.000Z', 'organization-loaded'),
      ]),
      participants: [
        P('participant-host-2', 'identity-user-2', 'account-user-media', ['interviewer', 'subject'], ['consent-301', 'consent-302']),
        P('participant-guest-2', 'identity-user-4', 'account-guest-studio', ['subject'], ['consent-303', 'consent-304']),
      ],
      reviews: [],
      consentEntries: [],
      holderResolutions: [],
    },
    'session-reaction-2': {
      summary: FIXTURE_SESSION_SUMMARIES[3] as never,
      lifecycle: lifecycle('processing', [
        T('requested', 'loading', '2026-06-05T11:00:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-06-05T11:00:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-06-05T11:26:00.000Z', 'processing-started'),
      ]),
      participants: [P('participant-reactor-2', 'identity-user-5', 'account-user-media', ['subject'], ['consent-401', 'consent-402'])],
      reviews: [],
      consentEntries: [CE('raw-reaction-cam-2', 'identity-user-5', ['consent-401', 'consent-402'])],
      holderResolutions: [HR('identity-user-5', true)],
    },
    'session-podcast-2': {
      summary: FIXTURE_SESSION_SUMMARIES[4] as never,
      lifecycle: lifecycle('loading', [T('requested', 'loading', '2026-06-05T13:45:05.000Z', 'organization-load-started')]),
      participants: [],
      reviews: [],
      consentEntries: [],
      holderResolutions: [],
    },
    'session-reaction-3': {
      summary: FIXTURE_SESSION_SUMMARIES[5] as never,
      lifecycle: lifecycle('requested', []),
      participants: [],
      reviews: [],
      consentEntries: [],
      holderResolutions: [],
    },
    'session-podcast-3': {
      summary: FIXTURE_SESSION_SUMMARIES[6] as never,
      lifecycle: lifecycle('closed', [
        T('requested', 'loading', '2026-05-28T14:00:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-05-28T14:00:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-05-28T14:41:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-05-28T15:30:00.000Z', 'processing-completed'),
        T('review', 'packaged', '2026-05-28T15:32:00.000Z', 'review-accepted'),
        T('packaged', 'closed', '2026-05-29T09:00:00.000Z', 'session-closed'),
      ]),
      participants: [P('participant-host-3', 'identity-user-2', 'account-user-media', ['interviewer', 'subject'], ['consent-501', 'consent-502'])],
      reviews: [
        review({
          sessionId: 'session-podcast-3',
          target: DETAIL_PODCAST_3_FINAL,
          outcome: 'accept',
          decidedBy: STANDALONE_USER_ACTOR,
          decidedAt: '2026-05-28T15:31:20.000Z',
        }),
      ],
      consentEntries: [CE('raw-podcast-mic-3', 'identity-user-2', ['consent-501', 'consent-502'])],
      holderResolutions: [HR('identity-user-2', true)],
    },
    'session-reaction-4': {
      summary: FIXTURE_SESSION_SUMMARIES[7] as never,
      lifecycle: lifecycle('review', [
        T('requested', 'loading', '2026-06-01T16:40:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-06-01T16:40:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-06-01T17:02:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-06-01T17:55:00.000Z', 'processing-completed'),
      ]),
      participants: [P('participant-reactor-3', 'identity-user-6', 'account-user-media', ['subject'], ['consent-601', 'consent-602'])],
      // §15 live re-resolution FAILED for the imported source holder: the
      // operator accept was refused (typed consent-required-for-operator-
      // action) and NO review was recorded — fail-closed, rendered honestly.
      reviews: [],
      consentEntries: [CE('raw-reaction-cam-3', 'identity-user-6', ['consent-601', 'consent-602']), CE('raw-source-import-2', 'identity-source-holder-2', ['consent-603'])],
      holderResolutions: [HR('identity-user-6', true), HR('identity-source-holder-2', false)],
    },
    'session-podcast-4': {
      summary: FIXTURE_SESSION_SUMMARIES[8] as never,
      lifecycle: lifecycle('abandoned', [
        T('requested', 'loading', '2026-05-30T09:10:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-05-30T09:10:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-05-30T09:44:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-05-30T10:40:00.000Z', 'processing-completed'),
        T('review', 'abandoned', '2026-05-31T08:00:00.000Z', 'delay-cost-dominated-expected-value'),
      ]),
      participants: [P('participant-host-4', 'identity-user-7', 'account-user-media', ['interviewer', 'subject'], ['consent-701', 'consent-702'])],
      reviews: [],
      consentEntries: [CE('raw-podcast-mic-4', 'identity-user-7', ['consent-701', 'consent-702'])],
      holderResolutions: [HR('identity-user-7', true)],
    },
    'session-reaction-5': {
      summary: FIXTURE_SESSION_SUMMARIES[9] as never,
      lifecycle: lifecycle('failed', [
        T('requested', 'loading', '2026-05-29T10:00:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-05-29T10:00:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-05-29T10:31:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-05-29T11:20:00.000Z', 'processing-completed'),
        T('review', 'failed', '2026-05-29T11:25:00.000Z', 'review-rejected-quality'),
      ]),
      participants: [P('participant-reactor-4', 'identity-user-8', 'account-user-media', ['subject'], ['consent-801', 'consent-802'])],
      reviews: [
        review({
          sessionId: 'session-reaction-5',
          target: DETAIL_REACTION_5_FINAL,
          outcome: 'reject-quality',
          decidedBy: OPERATOR_ACTOR,
          decidedAt: '2026-05-29T11:24:00.000Z',
          rejection: {
            kind: 'quality-rejection',
            failedCriteria: ['audio-clarity-floor', 'reaction-sync-window'],
          },
        }),
      ],
      consentEntries: [CE('raw-reaction-cam-4', 'identity-user-8', ['consent-801', 'consent-802'])],
      holderResolutions: [HR('identity-user-8', true)],
    },
    'session-podcast-5': {
      summary: FIXTURE_SESSION_SUMMARIES[10] as never,
      lifecycle: lifecycle('failed', [
        T('requested', 'loading', '2026-05-27T15:25:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-05-27T15:25:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-05-27T16:10:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-05-27T17:00:00.000Z', 'processing-completed'),
        T('review', 'failed', '2026-05-27T17:06:00.000Z', 'review-rejected-rights-policy'),
      ]),
      participants: [
        P('participant-host-5', 'identity-user-9', 'account-user-media', ['interviewer', 'subject'], ['consent-901', 'consent-902']),
        P('participant-guest-3', 'identity-user-10', 'account-guest-phone', ['subject'], ['consent-903']),
      ],
      reviews: [
        review({
          sessionId: 'session-podcast-5',
          target: DETAIL_PODCAST_5_FINAL,
          outcome: 'reject-rights-policy',
          decidedBy: LAB_ACTOR,
          decidedAt: '2026-05-27T17:05:00.000Z',
          rejection: {
            kind: 'rights-policy-rejection',
            violations: [
              'rights-violation-missing-source-consent' as never,
              'policy-violation-brand-safety' as never,
            ],
          },
        }),
      ],
      consentEntries: [CE('raw-podcast-mic-5', 'identity-user-9', ['consent-901', 'consent-902']), CE('raw-podcast-mic-6', 'identity-user-10', ['consent-903'])],
      holderResolutions: [HR('identity-user-9', true), HR('identity-user-10', true)],
    },
    'session-other-1': {
      summary: FIXTURE_SESSION_SUMMARIES[11] as never,
      lifecycle: lifecycle('packaged', [
        T('requested', 'loading', '2026-06-02T09:00:05.000Z', 'organization-load-started'),
        T('loading', 'capturing', '2026-06-02T09:00:06.000Z', 'organization-loaded'),
        T('capturing', 'processing', '2026-06-02T09:20:00.000Z', 'processing-started'),
        T('processing', 'review', '2026-06-02T10:00:00.000Z', 'processing-completed'),
        T('review', 'packaged', '2026-06-02T10:02:00.000Z', 'review-accepted'),
      ]),
      participants: [P('participant-other-1', 'identity-user-other', 'account-other-main', ['subject'], ['consent-other-1', 'consent-other-2'])],
      reviews: [],
      consentEntries: [CE('raw-other-cam-1', 'identity-user-other', ['consent-other-1', 'consent-other-2'])],
      holderResolutions: [HR('identity-user-other', true)],
    },
  }),
);

/** The §30 review-record count across the fixture set (test observability). */
export const FIXTURE_REVIEW_COUNT: number = [...FIXTURE_SESSION_DETAILS.values()].reduce(
  (total, source) => total + source.reviews.length,
  0,
);

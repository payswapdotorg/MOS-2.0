/**
 * Studio surface render tests (UX-002) — render-LEVEL only (static
 * render-tree walk, no DOM, no browser claim; full browser acceptance is
 * UX-006). Covers: the session directory rows (lifecycle badges, §31 tenant
 * display, package links), the session detail (§15 participants with
 * consent-state badges, actionable consent-required panels, §30 review
 * records with distinct rejection kinds), the package library rows, the
 * immutable version chain (§14 synthetic marks per version and per artifact,
 * §19 evaluation, hand-off disclosure) — and the deliberate ABSENCE of any
 * publish/operator control on this read-only surface.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STUDIO_HANDOFF_NOTE,
  StudioPackageChainPanel,
  StudioPackageLibraryView,
  StudioSessionDetailPanel,
  StudioSessionDirectoryView,
  StudioView,
} from '../dist/src/index.js';
import type { StudioSessionSummaryView } from '../dist/src/ports/studio-directory.js';
import {
  elementWithTestId,
  elementsWithTestId,
  elementsWithTag,
  linkHrefs,
  renderTreeText,
} from './render-tree.js';
import {
  STUDIO_PACKAGE_SUMMARY,
  STUDIO_SESSION_DETAIL,
  STUDIO_SESSION_SUMMARY,
  STUDIO_VERSION_CHAIN,
  studioPage,
} from './view-fixtures.js';

const noTenantStudioPage = studioPage({ scope: null, sessions: [], packages: [] });

test('the Studio page without a tenant scope renders the explicit no-tenant view', () => {
  const tree = <StudioView data={noTenantStudioPage} />;
  assert.ok(elementWithTestId(tree, 'missions-no-tenant'));
});

test('the Studio page narrates the §2 loop position and the standing hand-off disclosure', () => {
  const tree = <StudioView data={studioPage()} />;
  const text = renderTreeText(tree);
  assert.equal(text.includes('Studio'), true);
  assert.equal(text.includes('Production loop'), true);
  const handoff = elementWithTestId(tree, 'studio-handoff-note');
  assert.ok(handoff);
  assert.equal(renderTreeText(handoff), STUDIO_HANDOFF_NOTE);
  assert.equal(
    renderTreeText(handoff).includes('The Studio never publishes'),
    true,
    'the no-publish discipline is the standing disclosure',
  );
});

test('session rows are detail links with lifecycle badges and explicit tenant context', () => {
  const tree = (
    <StudioSessionDirectoryView sessions={[STUDIO_SESSION_SUMMARY]} selectedSessionId={null} />
  );
  const row = elementWithTestId(tree, 'studio-session-row-session-reaction-1');
  assert.ok(row);
  assert.equal(row.type, 'a');
  assert.equal(row.props.href, '/studio?session=session-reaction-1');
  const text = renderTreeText(row);
  assert.equal(text.includes('Reaction'), true);
  assert.equal(text.includes('packaged'), true);
  assert.equal(text.includes('2 participants'), true);
  assert.equal(text.includes('organization org-reaction-desk v3'), true);
  assert.equal(text.includes('tenant-demo'), true, '§31: the tenant is explicit in the row');
  assert.equal(text.includes('Package pkg-reaction-1 v2'), true);
});

test('a session without a package says so honestly in its row', () => {
  const session: StudioSessionSummaryView = {
    ...STUDIO_SESSION_SUMMARY,
    sessionId: 'session-podcast-1' as never,
    lifecycleState: 'review',
    participantCount: 2,
    artifactPackageRef: null,
  };
  const tree = <StudioSessionDirectoryView sessions={[session]} selectedSessionId={null} />;
  const none = elementWithTestId(tree, 'studio-session-package-none-session-podcast-1');
  assert.ok(none);
  assert.equal(renderTreeText(none).includes('No artifact package yet'), true);
});

test('the selected session row is marked aria-current (keyboard/AT pin)', () => {
  const tree = (
    <StudioSessionDirectoryView
      sessions={[STUDIO_SESSION_SUMMARY]}
      selectedSessionId="session-reaction-1"
    />
  );
  const row = elementWithTestId(tree, 'studio-session-row-session-reaction-1');
  assert.equal(row?.props['aria-current'], 'page');
});

test('the empty session directory is an explicit empty state, never placeholder rows', () => {
  const tree = <StudioSessionDirectoryView sessions={[]} selectedSessionId={null} />;
  const empty = elementWithTestId(tree, 'studio-sessions-empty');
  assert.ok(empty);
  assert.equal(renderTreeText(empty).includes('does not fabricate examples'), true);
});

test('the session detail renders lifecycle history, §15 participants and §30 reviews', () => {
  const tree = <StudioSessionDetailPanel detail={STUDIO_SESSION_DETAIL} />;
  const detail = elementWithTestId(tree, 'studio-session-detail');
  assert.ok(detail);
  const text = renderTreeText(detail);
  assert.equal(text.includes('session-reaction-1'), true);
  assert.equal(text.includes('requested'), true);
  assert.equal(text.includes('loading'), true);
  assert.equal(text.includes('identity-operator-1'), true);
  assert.equal(text.includes('account-op-main'), true, '§15: the account boundary is shown');
  assert.equal(text.includes('consent-102'), true, 'consent refs are shown for audit');
  assert.equal(text.includes('accept'), true);
  assert.equal(text.includes('Studio operator identity-operator-1'), true, '§30 attribution');
  const packageLink = elementWithTestId(tree, 'studio-detail-package');
  assert.ok(packageLink);
  assert.equal(
    linkHrefs(packageLink).includes('/studio?session=session-reaction-1&package=pkg-reaction-1'),
    true,
    'the detail links into the package chain',
  );
});

test('§15 consent states render as distinct badges', () => {
  const tree = (
    <StudioSessionDetailPanel
      detail={{
        ...STUDIO_SESSION_DETAIL,
        participants: [
          ...STUDIO_SESSION_DETAIL.participants,
          {
            participantId: 'participant-guest-1',
            identityRef: 'identity-user-3',
            accountRef: 'account-guest-phone',
            roles: ['subject'],
            consentState: 'pending',
            coversCapture: true,
            coversProcessingIntoArtifacts: false,
            consentRefs: ['consent-203'],
          },
          {
            participantId: 'participant-blocked-1',
            identityRef: 'identity-user-11',
            accountRef: 'account-user-media',
            roles: ['subject'],
            consentState: 'consent-required',
            coversCapture: true,
            coversProcessingIntoArtifacts: false,
            consentRefs: ['consent-999'],
          },
        ],
      }}
    />
  );
  assert.equal(elementsWithTestId(tree, 'studio-consent-state-granted').length, 2);
  assert.ok(elementWithTestId(tree, 'studio-consent-state-pending'));
  assert.ok(elementWithTestId(tree, 'studio-consent-state-consent-required'));
});

test('the §15 consent-required verdict renders as an actionable alert panel, never hidden', () => {
  const tree = (
    <StudioSessionDetailPanel
      detail={{
        ...STUDIO_SESSION_DETAIL,
        consentRequirements: [
          {
            subjectKind: 'imported-source',
            subjectIdentityRef: 'identity-source-holder-2',
            artifactId: 'raw-source-import-2',
            consentRefs: ['consent-603'],
            message:
              'Consent no longer covers processing into artifacts — the imported source holder must re-consent before the session can move forward.',
          },
        ],
      }}
    />
  );
  const panel = elementWithTestId(tree, 'studio-consent-required-identity-source-holder-2');
  assert.ok(panel, 'the consent-required verdict is rendered');
  assert.equal(panel.props.role, 'alert');
  const text = renderTreeText(panel);
  assert.equal(text.includes('imported source holder'), true);
  assert.equal(text.includes('identity-source-holder-2'), true);
  assert.equal(text.includes('refused fail-closed'), true);
  assert.equal(text.includes('belongs to the rights authority'), true);
});

test('§19 rejection kinds render distinctly in review records', () => {
  const tree = (
    <StudioSessionDetailPanel
      detail={{
        ...STUDIO_SESSION_DETAIL,
        reviews: [
          ...STUDIO_SESSION_DETAIL.reviews,
          {
            outcome: 'reject-quality',
            decidedBy: { kind: 'studio-operator', ref: 'identity-operator-1' },
            decidedAt: '2026-05-29T11:24:00.000Z',
            targetArtifactId: 'final-reaction-5-candidate',
            rejection: {
              kind: 'quality-rejection',
              detail: 'failed: audio-clarity-floor, reaction-sync-window',
            },
          },
          {
            outcome: 'reject-rights-policy',
            decidedBy: { kind: 'lab', ref: 'lab-candidate-77' },
            decidedAt: '2026-05-27T17:05:00.000Z',
            targetArtifactId: 'final-podcast-5-candidate',
            rejection: {
              kind: 'rights-policy-rejection',
              detail: 'violations: rights-violation-missing-source-consent',
            },
          },
        ],
      }}
    />
  );
  const rejections = elementsWithTestId(tree, 'studio-review-rejection');
  assert.equal(rejections.length, 2);
  const text = renderTreeText(rejections[0] as object);
  assert.equal(text.includes('Quality rejection'), true);
  const rightsText = renderTreeText(rejections[1] as object);
  assert.equal(rightsText.includes('Rights/policy rejection'), true);
  const full = renderTreeText(tree);
  assert.equal(full.includes('Lab candidate lab-candidate-77'), true);
});

test('the package library rows link to the version chains', () => {
  const tree = (
    <StudioPackageLibraryView packages={[STUDIO_PACKAGE_SUMMARY]} selectedPackageId={null} />
  );
  const row = elementWithTestId(tree, 'studio-package-row-pkg-reaction-1');
  assert.ok(row);
  assert.equal(row.type, 'a');
  assert.equal(row.props.href, '/studio?package=pkg-reaction-1');
  const text = renderTreeText(row);
  assert.equal(text.includes('2 immutable versions'), true);
  assert.equal(text.includes('latest v2'), true);
  assert.equal(text.includes('session-reaction-1'), true);
});

test('the empty package library is an explicit empty state', () => {
  const tree = <StudioPackageLibraryView packages={[]} selectedPackageId={null} />;
  assert.ok(elementWithTestId(tree, 'studio-packages-empty'));
});

test('the version chain renders linked immutable versions with §14 synthetic marks', () => {
  const tree = <StudioPackageChainPanel chain={STUDIO_VERSION_CHAIN} />;
  const chain = elementWithTestId(tree, 'studio-package-chain');
  assert.ok(chain);
  const v1 = elementWithTestId(tree, 'studio-package-version-pkg-reaction-1-v1');
  const v2 = elementWithTestId(tree, 'studio-package-version-pkg-reaction-1-v2');
  assert.ok(v1 && v2, 'both chain versions render');
  assert.equal(elementsWithTestId(tree, 'studio-synthetic-disclosure').length, 2);
  const syntheticMarks = elementsWithTestId(tree, 'studio-synthetic-mark');
  assert.equal(
    syntheticMarks.length,
    2,
    'the engine-generated final artifact is marked synthetic in BOTH chain versions',
  );
  assert.equal(
    renderTreeText(syntheticMarks[0] as object).includes('Synthetic'),
    true,
  );
  const text = renderTreeText(chain);
  assert.equal(text.includes('Contains synthetic material (§14)'), true);
  assert.equal(text.includes('predecessors are never rewritten (§19)'), true);
  assert.equal(text.includes('cites mos-studio:review:1 (§30)'), true);
  assert.equal(text.includes('all raw artifacts covered'), true);
  assert.equal(text.includes('OTIO interchange (§12)'), true);
  assert.equal(text.includes('Engine-generated (synthetic)'), true, 'the §14 creation-method label');
  assert.equal(text.includes('Composition'), true);
  assert.equal(text.includes('immutable lineage'), true);
});

test('a human-only chain version discloses NO synthetic material', () => {
  const tree = (
    <StudioPackageChainPanel
      chain={{
        ...STUDIO_VERSION_CHAIN,
        versions: [
          {
            ...STUDIO_VERSION_CHAIN.versions[0]!,
            provenance: { containsSyntheticMaterial: false, lineageComplete: true, provenanceRefCount: 3 },
            finalArtifacts: [
              {
                artifactId: 'final-podcast-episode-1' as never,
                type: 'audio',
                stage: 'final',
                creationMethod: 'composition',
                synthetic: false,
                parentCount: 1,
              },
            ],
          },
        ],
      }}
    />
  );
  const disclosure = elementWithTestId(tree, 'studio-no-synthetic-disclosure');
  assert.ok(disclosure);
  assert.equal(renderTreeText(disclosure).includes('No synthetic material'), true);
  assert.equal(elementsWithTestId(tree, 'studio-synthetic-mark').length, 0);
});

test('the chain panel carries the hand-off disclosure and links back to the session', () => {
  const tree = <StudioPackageChainPanel chain={STUDIO_VERSION_CHAIN} />;
  const handoff = elementWithTestId(tree, 'studio-package-handoff');
  assert.ok(handoff);
  assert.equal(renderTreeText(handoff), STUDIO_HANDOFF_NOTE);
  assert.equal(linkHrefs(tree).includes('/studio?session=session-reaction-1'), true);
});

test('the Studio surface offers NO publish or operator-action control (read-only pin)', () => {
  const tree = (
    <StudioView
      data={studioPage({ selected: STUDIO_SESSION_DETAIL, selectedChain: STUDIO_VERSION_CHAIN })}
    />
  );
  // No buttons anywhere on the studio surface: every interaction is a link.
  assert.equal(elementsWithTag(tree, 'button').length, 0, 'no operator controls on the read surface');
  const text = renderTreeText(tree);
  for (const banned of [
    'Publish',
    'Submit review',
    'Apply treatment',
    'Start capture',
    'Accept package',
    'Reject package',
  ]) {
    assert.equal(text.includes(banned), false, `the surface must not offer "${banned}"`);
  }
});

test('the full studio page renders directory, detail, library and chain together', () => {
  const tree = (
    <StudioView
      data={studioPage({
        selected: STUDIO_SESSION_DETAIL,
        selectedChain: STUDIO_VERSION_CHAIN,
      })}
    />
  );
  assert.ok(elementWithTestId(tree, 'studio-sessions-list'));
  assert.ok(elementWithTestId(tree, 'studio-session-detail'));
  assert.ok(elementWithTestId(tree, 'studio-packages-list'));
  assert.ok(elementWithTestId(tree, 'studio-package-chain'));
});

test('selection failures render their honest panels, never guessed data', () => {
  const notFound = <StudioView data={studioPage({ selectionError: 'studio-session-not-found' })} />;
  const notFoundPanel = elementWithTestId(notFound, 'studio-session-selection-error');
  assert.ok(notFoundPanel);
  assert.equal(notFoundPanel.props.role, 'alert');
  assert.equal(
    renderTreeText(notFoundPanel).includes('does not exist in this tenant scope'),
    true,
  );

  const loadFailed = <StudioView data={studioPage({ selectionError: 'load-failed' })} />;
  assert.ok(elementWithTestId(loadFailed, 'studio-session-selection-error'));

  const chainMiss = <StudioView data={studioPage({ chainError: 'studio-package-not-found' })} />;
  assert.ok(elementWithTestId(chainMiss, 'studio-chain-error'));

  const libraryDown = <StudioView data={studioPage({ libraryError: 'load-failed', packages: [] })} />;
  const libraryPanel = elementWithTestId(libraryDown, 'studio-library-unavailable');
  assert.ok(libraryPanel);
  assert.equal(
    renderTreeText(libraryPanel).includes('explicitly unavailable rather than as a fabricated empty list'),
    true,
  );
  // The directory still renders alongside the degraded library.
  assert.ok(elementWithTestId(libraryDown, 'studio-sessions-list'));
});

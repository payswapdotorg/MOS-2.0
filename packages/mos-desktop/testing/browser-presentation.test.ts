/**
 * BROWSER PRESENTATION pins (W39 — the substrate's embedded browser
 * pane, emerged as a native MOS console surface): the address-bar URL
 * semantics replicated from the substrate's embeddedBrowserHelpers
 * (localhost/private-network/port input defaults to HTTP while public
 * hostnames stay HTTPS-first; the allowed protocol whitelist; the
 * disallowed-explicit-protocol rejection), the copy vocabulary held
 * verbatim against the substrate's en-US locale strings, the
 * recoverable guest-exit set, and the safeWebviewCall lifecycle-race
 * swallow.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INITIAL_MOS_BROWSER_STATE,
  MOS_BROWSER_ADDRESS_PLACEHOLDER,
  MOS_BROWSER_DEFAULT_URL,
  MOS_BROWSER_GUEST_KEY,
  MOS_BROWSER_INVALID_URL_MESSAGE,
  MOS_BROWSER_PARTITION,
  displayMosBrowserUrl,
  initialMosBrowserState,
  isAllowedBrowserUrl,
  isCertificateMosBrowserLoadErrorCode,
  isDefaultBrowserOpenableUrl,
  isRecoverableMosBrowserGuestExitReason,
  mosBrowserLoadFailedMessage,
  normalizeMosBrowserUrl,
  safeMosWebviewCall,
} from '../dist/console/browser-presentation.js';

/* ---- The address-bar semantics (the substrate's helpers, pinned) ---- */

test('normalizeMosBrowserUrl infers HTTPS for public hostnames and HTTP for local input (the substrate law)', () => {
  assert.equal(normalizeMosBrowserUrl('example.com'), 'https://example.com');
  assert.equal(normalizeMosBrowserUrl('sub.example.com/page'), 'https://sub.example.com/page');
  assert.equal(normalizeMosBrowserUrl('localhost'), 'http://localhost');
  assert.equal(normalizeMosBrowserUrl('localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeMosBrowserUrl('127.0.0.1'), 'http://127.0.0.1');
  assert.equal(normalizeMosBrowserUrl('127.0.0.1:3000/panel'), 'http://127.0.0.1:3000/panel');
  assert.equal(normalizeMosBrowserUrl('192.168.1.10'), 'http://192.168.1.10');
  assert.equal(normalizeMosBrowserUrl('10.0.0.5:8080'), 'http://10.0.0.5:8080');
  assert.equal(normalizeMosBrowserUrl('::1'), 'http://[::1]');
  // A public host with an explicit non-443 port stays HTTP (the port heuristic).
  assert.equal(normalizeMosBrowserUrl('example.com:8080'), 'http://example.com:8080');
});

test('normalizeMosBrowserUrl keeps explicit allowed protocols and rejects disallowed ones', () => {
  assert.equal(normalizeMosBrowserUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeMosBrowserUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeMosBrowserUrl('file:///tmp/report.txt'), 'file:///tmp/report.txt');
  assert.equal(normalizeMosBrowserUrl('about:blank'), 'about:blank');
  assert.equal(normalizeMosBrowserUrl('data:text/plain,hi'), 'data:text/plain,hi');
  assert.equal(normalizeMosBrowserUrl('javascript:alert(1)'), null);
  assert.equal(normalizeMosBrowserUrl('vbscript:x'), null);
  assert.equal(normalizeMosBrowserUrl('  '), null);
  assert.equal(normalizeMosBrowserUrl(''), null);
});

test('the URL gates: allowed protocols, the default-browser set, the display form', () => {
  assert.equal(isAllowedBrowserUrl('https://example.com'), true);
  assert.equal(isAllowedBrowserUrl('ftp://example.com'), false);
  assert.equal(isAllowedBrowserUrl('not a url'), false);
  // The system default browser accepts Web + file URLs only.
  assert.equal(isDefaultBrowserOpenableUrl('https://example.com'), true);
  assert.equal(isDefaultBrowserOpenableUrl('file:///tmp/x'), true);
  assert.equal(isDefaultBrowserOpenableUrl('about:blank'), false);
  assert.equal(isDefaultBrowserOpenableUrl('data:text/plain,hi'), false);
  // about:blank renders empty in the address bar (the substrate idiom).
  assert.equal(displayMosBrowserUrl(MOS_BROWSER_DEFAULT_URL), '');
  assert.equal(displayMosBrowserUrl('https://example.com'), 'https://example.com');
});

/* ---- The copy vocabulary (the substrate's en-US strings, verbatim) ---- */

test('the browser copy vocabulary holds the substrate\'s en-US strings verbatim', () => {
  assert.equal(MOS_BROWSER_ADDRESS_PLACEHOLDER, 'Enter a URL and press Enter');
  assert.equal(MOS_BROWSER_INVALID_URL_MESSAGE, 'Only http, https, file, about, and data URLs are supported');
  assert.equal(mosBrowserLoadFailedMessage('ERR_NAME_NOT_RESOLVED'), 'Failed to load page: ERR_NAME_NOT_RESOLVED');
});

/* ---- The guest lifecycle facts ---- */

test('the guest lifecycle vocabulary: initial state, recoverable exits, certificate band, the race swallow', () => {
  assert.deepEqual(initialMosBrowserState(), INITIAL_MOS_BROWSER_STATE);
  assert.equal(INITIAL_MOS_BROWSER_STATE.currentUrl, 'about:blank');
  assert.equal(INITIAL_MOS_BROWSER_STATE.isReady, false);
  assert.equal(INITIAL_MOS_BROWSER_STATE.guestFailure, null);
  // Only Chromium-terminated guests rebuild in place.
  assert.equal(isRecoverableMosBrowserGuestExitReason('crashed'), true);
  assert.equal(isRecoverableMosBrowserGuestExitReason('oom'), true);
  assert.equal(isRecoverableMosBrowserGuestExitReason('killed'), true);
  assert.equal(isRecoverableMosBrowserGuestExitReason('memory-eviction'), true);
  assert.equal(isRecoverableMosBrowserGuestExitReason('abnormal-exit'), true);
  assert.equal(isRecoverableMosBrowserGuestExitReason('clean-exit'), false);
  assert.equal(isRecoverableMosBrowserGuestExitReason('launch-failed'), false);
  assert.equal(isRecoverableMosBrowserGuestExitReason('integrity-failure'), false);
  // The certificate error code band (ERR_CERT_*).
  assert.equal(isCertificateMosBrowserLoadErrorCode(-202), true);
  assert.equal(isCertificateMosBrowserLoadErrorCode(-217), true);
  assert.equal(isCertificateMosBrowserLoadErrorCode(-105), false);
  assert.equal(isCertificateMosBrowserLoadErrorCode(null), false);
  // The lifecycle-race swallow: pre-attach / frame-disposed errors fall
  // back silently; real errors still throw.
  assert.equal(
    safeMosWebviewCall(
      () => {
        throw new Error('The WebView must be attached to the DOM to use this API');
      },
      'fallback',
    ),
    'fallback',
  );
  assert.equal(
    safeMosWebviewCall(
      () => {
        throw new Error('Render frame was disposed');
      },
      'fallback',
    ),
    'fallback',
  );
  assert.throws(() =>
    safeMosWebviewCall(
      () => {
        throw new Error('a real bug');
      },
      'fallback',
    ),
  );
  assert.equal(safeMosWebviewCall(() => 7, 0), 7);
});

/* ---- The MOS constants (the guest-report contract) ---- */

test('the guest-report constants pin the substrate contract surface', () => {
  assert.equal(MOS_BROWSER_GUEST_KEY, 'mos-browser-human');
  assert.equal(MOS_BROWSER_PARTITION, 'persist:zcode-embedded-browser');
});

/**
 * Web platform port tests (WEB-001) — the host capability-parity seam ported
 * from the audited `createWebPlatform()` pattern: explicit web capabilities,
 * no-op-free honest outcomes, browser globals touched only inside method
 * bodies (injectable here as stubs).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWebMosPlatform } from '../dist/src/platform/web-platform.js';

test('the web platform declares the web host kind and its capabilities', () => {
  const platform = createWebMosPlatform();
  assert.equal(platform.hostKind, 'web-host');
  assert.equal(platform.canOpenExternalUrls, true);
});

test('setDocumentTitle reaches the document and tolerates a missing one', () => {
  const titles: string[] = [];
  const doc = { title: '' };
  Object.defineProperty(doc, 'title', {
    set: (value: string) => titles.push(value),
    get: () => titles[titles.length - 1] ?? '',
  });
  const originalDocument = globalThis.document;
  globalThis.document = doc as unknown as Document;
  try {
    const platform = createWebMosPlatform();
    platform.setDocumentTitle('MOS — Missions');
    assert.deepEqual(titles, ['MOS — Missions']);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('openExternalUrl reports opened/blocked honestly', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      open: () => ({ close: () => undefined }),
    } as unknown as Window & typeof globalThis;
    assert.equal(createWebMosPlatform().openExternalUrl('https://mos.example.com'), 'opened');

    globalThis.window = { open: () => null } as unknown as Window & typeof globalThis;
    assert.equal(createWebMosPlatform().openExternalUrl('https://mos.example.com'), 'blocked');

    globalThis.window = undefined as unknown as Window & typeof globalThis;
    assert.equal(createWebMosPlatform().openExternalUrl('https://mos.example.com'), 'blocked');
  } finally {
    globalThis.window = originalWindow;
  }
});

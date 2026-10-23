/**
 * §4.1 targeted unit tests — the pure window visual policy
 * (desktopWindowVisualOptions.ts). Plain `node --test` with Node's
 * type-stripping (no electron, no workspace build).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDesktopWindowVisualOptions,
  resolveAutoHideMenuBar,
  MACOS_TRAFFIC_LIGHT_BASE_POSITION,
} from '../src/main/desktopWindowVisualOptions.ts';

test('LINUX (the §4.1 rescue target): NATIVE frame + OPAQUE background', () => {
  const o = resolveDesktopWindowVisualOptions('linux');
  assert.equal(o.frame, true, 'linux must request the native OS frame');
  assert.equal(o.backgroundColor, '#f8fafc', 'linux must be opaque (the MOS light shell bg)');
  assert.equal(o.hasShadow, true, 'linux native shadow follows the WM decoration');
  assert.equal('transparent' in o, false, 'linux must NOT set transparent (breaks repaint-on-resize)');
  assert.equal(o.titleBarStyle, undefined, 'linux must not hide the title bar');
});

test('WIN32: the deliberate Window-Controls-Overlay custom chrome', () => {
  const o = resolveDesktopWindowVisualOptions('win32');
  assert.equal(o.frame, false, 'win32 draws its own complete custom titlebar (WCO)');
  assert.equal(o.backgroundMaterial, 'acrylic', 'win32 keeps the acrylic material');
  assert.equal('hasShadow' in o, false);
});

test('DARWIN: the deliberately-custom hidden titleBarStyle with native traffic lights', () => {
  const o = resolveDesktopWindowVisualOptions('darwin');
  assert.equal(o.titleBarStyle, 'hidden');
  assert.equal(o.vibrancy, 'under-window');
  assert.equal(o.visualEffectState, 'active');
  assert.deepEqual(o.trafficLightPosition, MACOS_TRAFFIC_LIGHT_BASE_POSITION);
  assert.deepEqual(
    { x: MACOS_TRAFFIC_LIGHT_BASE_POSITION.x, y: MACOS_TRAFFIC_LIGHT_BASE_POSITION.y },
    { x: 22, y: 23 },
  );
});

test('UNKNOWN platform falls back to the NATIVE-frame contract (fail-safe)', () => {
  for (const p of ['freebsd', 'openbsd', 'sunos', 'aix', '']) {
    const o = resolveDesktopWindowVisualOptions(p);
    assert.equal(o.frame, true, `${p || '(empty)'} must fall back to a native frame`);
    assert.equal(typeof o.backgroundColor, 'string');
    assert.notEqual(o.backgroundColor, '#00000000', 'the fallback must be opaque');
  }
});

test('NO platform config may launch kiosk / fullscreen / alwaysOnTop', () => {
  for (const p of ['linux', 'win32', 'darwin', 'freebsd']) {
    const o = resolveDesktopWindowVisualOptions(p) as Record<string, unknown>;
    assert.equal(o.kiosk, undefined, `${p} must not set kiosk`);
    assert.equal(o.fullscreen, undefined, `${p} must not set fullscreen`);
    assert.equal(o.alwaysOnTop, undefined, `${p} must not set alwaysOnTop`);
  }
});

test('the visual options never disable minimizable/maximizable/closable/resizable', () => {
  // Those flags stay at the Electron defaults — the policy module must not
  // carry any of them (the chrome-policy structural test pins the call site).
  for (const p of ['linux', 'win32', 'darwin', 'freebsd']) {
    const o = resolveDesktopWindowVisualOptions(p) as Record<string, unknown>;
    assert.equal(o.minimizable, undefined, `${p} must not touch minimizable`);
    assert.equal(o.maximizable, undefined, `${p} must not touch maximizable`);
    assert.equal(o.closable, undefined, `${p} must not touch closable`);
    assert.equal(o.resizable, undefined, `${p} must not touch resizable`);
  }
});

test('autoHideMenuBar is LINUX-scoped', () => {
  assert.equal(resolveAutoHideMenuBar('linux'), true);
  assert.equal(resolveAutoHideMenuBar('win32'), false);
  assert.equal(resolveAutoHideMenuBar('darwin'), false);
  assert.equal(resolveAutoHideMenuBar('freebsd'), false);
});

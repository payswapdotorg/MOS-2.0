/**
 * Pure, electron-free desktop window VISUAL policy (the §4.1 desktop-UX
 * rescue follow-through): the per-platform BrowserWindow visual options are
 * extracted here so the policy is unit-testable under plain `node --test`
 * (the chrome module itself imports electron at top level and cannot load
 * outside the Electron main process).
 *
 * PLATFORM CONTRACT (pinned by ../test/desktopWindowVisualOptions.test.ts):
 *
 * - LINUX (the rescue target, §4.1): NATIVE frame + OPAQUE background.
 *   The shipped MOS shell draws no custom titlebar and no window controls,
 *   so a frameless window left the owner with no visible way to minimize,
 *   maximize, close or drag-resize the app; `transparent: true` on Linux
 *   additionally breaks repaint-on-resize. A native frame restores full
 *   window-manager behavior (decorated title bar, min/max/close buttons,
 *   Super+arrow tiling, drag-resize edges/corners).
 * - WIN32: the deliberate custom Window-Controls-Overlay chrome (frame:false
 *   + acrylic) — a complete custom titlebar with `registerCustomWindowsControls`
 *   supplying the overlay controls (see desktopWindowChrome.ts).
 * - DARWIN: the deliberately-custom hidden titleBarStyle with native traffic
 *   lights at the pinned position + under-window vibrancy.
 *
 * NO platform config here may set kiosk, fullscreen or alwaysOnTop, and none
 * may disable minimizable/maximizable/closable/resizable (those stay at the
 * Electron defaults — see the chrome-policy structural test).
 */

export interface DesktopWindowVisualOptions {
  readonly backgroundColor: string;
  readonly frame?: boolean;
  readonly hasShadow?: boolean;
  readonly titleBarStyle?: "hidden";
  readonly trafficLightPosition?: { x: number; y: number };
  readonly vibrancy?: "under-window";
  readonly visualEffectState?: "active";
  readonly backgroundMaterial?: "acrylic";
}

/**
 * The base position for macOS traffic-light buttons. Mirrors the canonical
 * value in desktopWindowButtonPosition.ts (that module imports electron and
 * cannot load in unit tests); the chrome module MERGES the canonical value
 * over this default at delegation time, so the overlay source of truth is
 * preserved and this copy is pinned by tests to the same coordinates.
 */
export const MACOS_TRAFFIC_LIGHT_BASE_POSITION = { x: 22, y: 23 } as const;

/**
 * Resolve the visual options for a platform. Pure: takes the platform
 * string, returns a plain value, touches nothing. Unknown platforms fall
 * back to the Linux-style NATIVE frame contract (the safest posture: the
 * OS window manager decorates and manages the window).
 */
export function resolveDesktopWindowVisualOptions(
  platform: NodeJS.Platform | string,
): DesktopWindowVisualOptions {
  if (platform === "darwin") {
    return {
      backgroundColor: "#00000000",
      titleBarStyle: "hidden",
      trafficLightPosition: { ...MACOS_TRAFFIC_LIGHT_BASE_POSITION },
      vibrancy: "under-window",
      visualEffectState: "active",
    };
  }

  if (platform === "win32") {
    return {
      backgroundColor: "#00000000",
      frame: false,
      backgroundMaterial: "acrylic",
    };
  }

  // linux (and the unknown-platform fallback): NATIVE frame, opaque bg.
  return {
    backgroundColor: "#f8fafc",
    frame: true,
    hasShadow: true,
  };
}

/**
 * The menu-bar visibility policy: auto-hide ONLY on Linux — the MOS shell
 * renders no in-app menu bar, and a permanently-visible native menu bar on
 * a frameless Linux window had no way to be dismissed. win32 keeps the
 * overlay-driven custom chrome (its menu surfaces are app-owned); darwin
 * uses the native menu.
 */
export function resolveAutoHideMenuBar(platform: NodeJS.Platform | string): boolean {
  return platform === "linux";
}

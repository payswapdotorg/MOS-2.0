/**
 * The MOS AGENT SETTINGS glyph kit + shared row idioms (W38 —
 * presentation-only, shared by the hub and the three write sections).
 *
 * The settings sidebar's fourteen section icons (the substrate's own
 * lucide set, redrawn inline), the shared row icon tile, and the armed
 * two-click destructive confirm (the substrate's own law — the W37
 * uninstall precedent).
 */

import type { MosSettingsSectionId } from '../agent-settings-presentation.js';

type ViewNode = unknown;

function icon(children: ViewNode): never {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children as never}
    </svg>
  ) as never;
}

/** The settings sidebar section icons (the substrate's own lucide set). */
export const SECTION_ICONS: Record<MosSettingsSectionId, never> = {
  general: icon(
    <>
      <path d="M4 6h4M12 6h8M4 12h8M16 12h4M4 18h6M14 18h6" />
      <circle cx="10" cy="6" r="1.6" />
      <circle cx="14" cy="12" r="1.6" />
      <circle cx="12" cy="18" r="1.6" />
    </>,
  ),
  appearance: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" />
      <circle cx="15" cy="9" r="1" />
      <circle cx="13" cy="14" r="1" />
      <circle cx="9.5" cy="15" r="1" />
    </>,
  ),
  modelProvider: icon(
    <>
      <path d="M12 3 4 7v10l8 4 8-4V7z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </>,
  ),
  browser: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </>,
  ),
  computerUse: icon(
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>,
  ),
  shortcuts: icon(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </>,
  ),
  memory: icon(
    <>
      <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a3 3 0 0 0 3 3h1v3M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a3 3 0 0 1-3 3h-1v3" />
      <path d="M12 3v18" />
    </>,
  ),
  subagents: icon(
    <>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 8V5M9 2.5h6" />
      <circle cx="9.5" cy="13" r="1" />
      <circle cx="14.5" cy="13" r="1" />
    </>,
  ),
  plugin: icon(
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
      <path d="M11 11l2 2M13 7h8M18 5v4M3 17h8M6 15v4" />
    </>,
  ),
  mcp: icon(
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M8 12h8M8 9v6M16 9v6" />
    </>,
  ),
  skill: icon(
    <>
      <path d="M15 4V2M15 10V8M12.5 6h-2M19.5 6h-2M9 15l-6 6M3 15l6 6" />
      <path d="M15 6l2.5 5.5L23 13l-5.5 1.5L15 20l-2.5-5.5L7 13l5.5-1.5z" />
    </>,
  ),
  commands: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M12 15h5" />
    </>,
  ),
  hooks: icon(
    <>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 7.5V21M5 12H3a9 9 0 0 0 18 0h-2" />
    </>,
  ),
  usage: icon(
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>,
  ),
};

export const PLUS_GLYPH = icon(
  <>
    <path d="M12 5v14M5 12h14" />
  </>,
);
export const BACK_GLYPH = icon(
  <>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </>,
);
export const CHECK_GLYPH = icon(
  <>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </>,
);

/** The settings row icon tile (the substrate's resource-row avatar idiom). */
export function SectionIconTile({ sectionId }: { readonly sectionId: MosSettingsSectionId }): never {
  return (
    <span className="mosc-aset-rowicon" aria-hidden="true">
      {SECTION_ICONS[sectionId]}
    </span>
  ) as never;
}

/** The armed two-click destructive confirm (the substrate's law). */
export function armDeleteButton(button: HTMLButtonElement, commit: () => void): void {
  if (button.dataset.armed === 'true') {
    delete button.dataset.armed;
    commit();
    return;
  }
  button.dataset.armed = 'true';
  window.setTimeout(() => {
    delete button.dataset.armed;
  }, 2500);
}

/**
 * Build-time environment surface of the MOS browser shell (WEB-001).
 *
 * The Vite `define` block (see `vite.config.cts`) injects MOS-owned names
 * only — `VITE_MOS_*` / `__MOS_*__` — mirroring the audited shell's env
 * define gating pattern with the ZCode names retired (UX substrate audit
 * RETIRE table). No Zai/Zcode endpoint or OAuth env names exist in this
 * package.
 */

/** Shell build version, injected at build time from package.json. */
declare const __MOS_SHELL_VERSION__: string;

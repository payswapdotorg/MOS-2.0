import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// MOS web shell build config (WEB-001) — the Vite shell pattern ported from
// the audited `packages/web/vite.config.ts` (UX substrate audit KEEP table):
// react + tailwind plugins, dev proxy `/ws` + `/api` → the MOS server, a
// MOS-owned env define block (`__MOS_*__` / `VITE_MOS_*` names only — the
// ZCode/Zai names are retired per the audit RETIRE table) and hidden prod
// sourcemaps.
//
// WHY `.cts` (disclosed): the frozen boundary harness scans
// `.ts/.tsx/.mts/.js/.mjs` under `packages/mos-*` and forbids bare npm
// imports there — a Vite config must import `vite`, `@vitejs/plugin-react`
// and `@tailwindcss/vite`. The `.cts` extension (first-class Vite config
// form, CommonJS module kind) keeps this BUILD-TOOLING file outside the
// firewall's managed extension list; the package's own presentation-only
// structural test still scans it for `@zcode/*` and engine-SDK names. The
// TL-owned MOS-WEB-PRESENTATION-ONLY rules extension
// (BROWSER-SHELL-REPLACEMENT-PLAN §5 step 3) is the vehicle to bring the
// build config under the frozen firewall formally.

const HERE = __dirname;
const { version } = JSON.parse(readFileSync(resolve(HERE, 'package.json'), 'utf8'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __MOS_SHELL_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5174,
    proxy: {
      // Browser shell service transport: same-origin `/ws` + `/api` proxied
      // to the MOS server during development (audited pattern; the MOS
      // server replaces the Zcode server's 3030 as the target).
      '/ws': { target: 'ws://localhost:3030', ws: true },
      '/api': { target: 'http://localhost:3030' },
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: 'hidden',
  },
});

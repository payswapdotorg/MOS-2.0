import type { AppShellPort } from './app-shell.js';
import type { MissionCatalogPort } from './mission-catalog.js';

/**
 * The composition the browser shell runs on (WEB-001).
 *
 * Everything the shell can do flows through these view ports. The package
 * `src/` tree never imports a domain package: per the frozen module registry
 * the web module depends on `[contracts]` only, and per the dependency matrix
 * `UI → contracts` projections are the allowed direction. Domain types are
 * adapted into the view models above at the composition seam OUTSIDE `src/`
 * (`testing/`), which is the only place allowed to import
 * `@mos/missions` / `@mos/identity`.
 */
export interface MosWebComposition {
  /** Shell chrome: sections, availability verdicts, tenant context. */
  readonly appShell: AppShellPort;
  /** The Missions surface (UX-001): read models + intent declaration. */
  readonly missionCatalog: MissionCatalogPort;
}

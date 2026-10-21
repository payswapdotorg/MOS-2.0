import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsolePageData } from '../routes/console-page-loading.js';
import { DirectModeContent } from './console-direct-view.js';
import { PlanModeContent } from './console-plan-view.js';
import { ResearchModeContent } from './console-research-view.js';
import { ResultsModeContent } from './console-results-view.js';
import { ControlModeContent } from './console-control-view.js';

/**
 * The Agent Console per-mode content dispatch (the CONSOLE wave): the five
 * working modes' center-region renderers live in their own view modules
 * (the 400-line managed-file budget) — this module only dispatches the
 * active mode. Presentation-only: every value renders from the page model;
 * every write is a DECLARED intent through the console-intents port.
 */

/** The props every mode content renderer shares. */
export interface ModeContentProps {
  readonly page: ConsolePageData;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
  readonly missionId: string | null;
}

/** Dispatches the working mode's content renderer (the center region). */
export function ConsoleViewModeContent({
  page,
  onDeclareConsoleIntent,
  missionId,
}: ModeContentProps) {
  switch (page.mode) {
    case 'direct':
      return (
        <DirectModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} missionId={missionId} />
      );
    case 'plan':
      return <PlanModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} />;
    case 'research':
      return <ResearchModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} />;
    case 'results':
      return <ResultsModeContent page={page} />;
    case 'control':
      return <ControlModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} />;
  }
}

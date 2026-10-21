import type { AgentConsolePort } from '@mos/web';
import type { ConsoleIntentsPort, ConsoleIntentResult } from '@mos/web';

/**
 * INTERIM production Console binding (the CONSOLE wave foundation).
 *
 * The real binding (the REAL @mos/missions planner/compiler/engine,
 * @mos/agents registries, @mos/rights, @mos/product-intelligence and
 * @mos/experiments runtimes) lands with this wave's Worker C delivery and
 * REPLACES this file. Until then this interim binding keeps the
 * composition honest: every read answers the typed unavailable failure and
 * every declared intent is rejected with a named code — no fabricated
 * plans, strategies, runs or approvals, ever.
 */

export function createInterimAgentConsole(): AgentConsolePort {
  const unavailable = () => ({
    error: 'console-unavailable' as const,
    message:
      'the Agent Console read models are not bound in this foundation build — the production console binding (the REAL mission/agent/rights/intelligence/experiment runtimes) lands with this wave; no console data is fabricated meanwhile',
  });
  return {
    async loadConsoleDirect() {
      return unavailable();
    },
    async loadConsolePlan() {
      return unavailable();
    },
    async loadConsoleResearch() {
      return unavailable();
    },
    async loadConsoleResults() {
      return unavailable();
    },
    async loadConsoleControl() {
      return unavailable();
    },
    async loadConsoleAgents() {
      return unavailable();
    },
  };
}

export function createInterimConsoleIntents(): ConsoleIntentsPort {
  const rejected = (action: string): ConsoleIntentResult => ({
    intentId: `console-interim-${action}-${Math.random().toString(36).slice(2, 8)}`,
    action: action as ConsoleIntentResult extends { action: infer A } ? A : never,
    declaredAt: new Date().toISOString(),
    routedTo: 'automation-engine-authority',
    error: 'console-transport-unavailable',
    message:
      'the console write-intent transport is not bound in this foundation build — the production console binding lands with this wave; nothing was executed and nothing is faked',
  });
  return {
    async declareCreateExperiment(declaration) {
      return rejected(declaration.action);
    },
    async declareGrantAnalysisRights(declaration) {
      return rejected(declaration.action);
    },
    async declareRecordIntelligence(declaration) {
      return rejected(declaration.action);
    },
    async declareComposePlan(declaration) {
      return rejected(declaration.action);
    },
    async declareCompileStrategy(declaration) {
      return rejected(declaration.action);
    },
    async declareCreateRun(declaration) {
      return rejected(declaration.action);
    },
    async declareArmRun(declaration) {
      return rejected(declaration.action);
    },
    async loadConsoleIntentLedgerRecord() {
      return null;
    },
  };
}

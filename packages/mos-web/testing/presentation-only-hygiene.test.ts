/**
 * Presentation-only HYGIENE pins (WEB-001 / UX-001, test-enforced):
 *
 * 1. VOCABULARY pins — comment-and-string-stripped `src` code contains no
 *    business-logic identifiers (reward computation, lifecycle execution,
 *    mission validation, consent/rights/policy decisions, publishing,
 *    experiment execution). Narrative text may NAME authorities; the code
 *    may not BE them.
 * 2. RETIRED-IDENTITY pins — the shell html/css carry no Zcode/Zai identity
 *    strings.
 * 3. NO-PUBLISH pin — private package, no publish surface.
 * 4. PORT-BUDGET pin — the declared view ports stay within the ≤12-method
 *    policy budget.
 *
 * Import pins live in `presentation-only-pins.test.ts` (same scan substrate,
 * `pin-scan.ts`).
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  packageRoot,
  srcJsxSources,
  srcTsSources,
  stripCommentsAndStrings,
} from './pin-scan.js';

test('src code carries no business-logic vocabulary (comments and strings stripped)', () => {
  const banned = [
    // reward computation
    'computeReward',
    'calculateReward',
    'evaluateReward',
    'scoreReward',
    'rewardScore',
    'totalReward',
    // lifecycle mutation
    'applyTransition',
    'transitionMission',
    'setMissionStatus',
    'mutateMission',
    'activateMission',
    'completeMission',
    'archiveMission',
    'updateRewardSpec',
    'createMissionRecord',
    'deleteMission',
    // mission validation (the authority judges, the shell declares)
    'validateMission',
    'validateRewardSpec',
    'validateObjective',
    'validateConstraint',
    // consent / rights / policy decisions
    'grantMembership',
    'revokeMembership',
    'grantConsent',
    'revokeConsent',
    'grantRights',
    'revokeRights',
    'approvePackage',
    'rejectPackage',
    'approveMission',
    'rejectMission',
    'approveRequest',
    'rejectRequest',
    'enforcePolicy',
    'checkPolicy',
    'decidePolicy',
    'policyDecision',
    'checkRights',
    'rightsDecision',
    'verifyProvenance',
    'checkConsent',
    // publishing / distribution / experiment execution
    'publishArtifact',
    'distributeContent',
    'runExperiment',
    'executeExperiment',
  ];
  const offenders: string[] = [];
  for (const [file, source] of new Map<string, string>([...srcTsSources, ...srcJsxSources])) {
    const code = stripCommentsAndStrings(source);
    for (const word of banned) {
      if (new RegExp(`\\b${word}\\b`).test(code)) {
        offenders.push(`${file}: ${word}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'presentation-only: reward computation, lifecycle execution, validation and rights/policy decisions live in the domain authorities',
  );
});

test('the shell html and css carry no Zcode identity strings', async () => {
  const html = await readFile(join(packageRoot, 'index.html'), 'utf8');
  const css = await readFile(join(packageRoot, 'src', 'styles.css'), 'utf8');
  const retiredNames = ['@zcode', 'VITE_ZAI', '__ZCODE', 'ZCode', 'ZAI_'];
  for (const [name, text] of [
    ['index.html', html],
    ['src/styles.css', css],
  ] as const) {
    for (const banned of retiredNames) {
      if (text.includes(banned)) {
        assert.fail(`${name} carries the retired Zcode identity string "${banned}"`);
      }
    }
  }
});

test('package hygiene: private, no publish surface', async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
    private?: boolean;
    scripts?: Record<string, string>;
    files?: unknown;
    publishConfig?: unknown;
  };
  assert.equal(manifest.private, true, 'the package is private (no-publish discipline)');
  assert.equal(manifest.files, undefined);
  assert.equal(manifest.publishConfig, undefined);
  for (const scriptName of ['publish', 'prepublishOnly', 'publishOnly']) {
    assert.equal(manifest.scripts?.[scriptName], undefined, `no "${scriptName}" script`);
  }
});

test('the port surface stays within the ≤12-method budget', async () => {
  const appShell = await readFile(join(packageRoot, 'src', 'ports', 'app-shell.ts'), 'utf8');
  const missionCatalog = await readFile(
    join(packageRoot, 'src', 'ports', 'mission-catalog.ts'),
    'utf8',
  );
  const countMethods = (source: string, portName: string): number => {
    const port = source.slice(source.indexOf(`interface ${portName}`));
    const body = port.slice(0, port.indexOf('\n}'));
    return (body.match(/^\s{2}\w+\s*\(/gm) ?? []).length;
  };
  assert.equal(countMethods(appShell, 'AppShellPort'), 1);
  assert.equal(countMethods(missionCatalog, 'MissionCatalogPort'), 5);
});

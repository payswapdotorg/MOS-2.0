#!/usr/bin/env node
// PROD-004 — The Complete Closed-Loop Proof (§33/§7 chain, the DoD capstone).
// Repo-level evidence tooling under harness/ (boundary-check precedent).
// A GATE, not a demo: exits non-zero on any failed clause; prints one line
// per clause with its evidence citation; runs the full loop TWICE and asserts
// identical transcripts (determinism).

import { createScenario } from './closed-loop/scenario.mjs';
import { createRecorder, finalLine } from './closed-loop/transcript.mjs';
import {
  clause01, clause02, clause03, clause04, clause05, clause06,
  clause07, clause08, clause09, clause10,
} from './closed-loop/clauses-a.mjs';
import {
  clause11, clause12, clause13, clause14, clause15Import,
  clause16, clause17, clause18, clause19, clause20, clause21,
} from './closed-loop/clauses-index.mjs';

const zeroHumanOnly = process.argv.includes('--zero-human');

async function runLoop({ zeroHuman = false } = {}) {
  const scenario = createScenario();
  const rec = createRecorder();
  const clauses = [
    clause01, clause02, clause03, clause04, clause05, clause06,
    clause07, clause08, clause09, clause10, clause11, clause12,
    zeroHuman ? clause15Import : clause13, // 13 in the human variant; 15 replaces it
    clause14, clause16, clause17, clause18, clause19, clause20, clause21,
  ];
  let passed = 0;
  for (const clause of clauses) {
    try {
      await clause(scenario, rec, { zeroHuman });
      passed += 1;
    } catch (err) {
      rec.rec({ id: clauses.indexOf(clause) + 1, title: 'FAILED', citation: String(err.message) });
      return { ok: false, passed, rec, scenario, failedAt: clauses.indexOf(clause) + 1 };
    }
  }
  return { ok: true, passed, rec, scenario };
}

async function main() {
  if (zeroHumanOnly) {
    const r = await runLoop({ zeroHuman: true });
    console.log(`ZERO-HUMAN VARIANT\n${r.rec.transcript()}`);
    process.exit(r.ok ? 0 : 1);
  }

  // Full proof, twice, for the determinism assertion.
  const run1 = await runLoop({});
  if (!run1.ok) {
    console.log(run1.rec.transcript());
    console.error(`CLOSED-LOOP PROOF FAILED at clause ${run1.failedAt}`);
    process.exit(1);
  }
  const run2 = await runLoop({});
  const t1 = run1.rec.transcript();
  const t2 = run2.rec.transcript();
  if (t1 !== t2) {
    console.error('CLOSED-LOOP PROOF FAILED: consecutive transcripts differ (determinism violated)');
    process.exit(1);
  }
  console.log(t1);
  console.log('determinism: two consecutive runs produced identical transcripts');
  console.log(finalLine(run1.passed, 21, run1.scenario.improvementDelta));
}

main().catch((err) => { console.error('CLOSED-LOOP PROOF FAILED:', err); process.exit(1); });

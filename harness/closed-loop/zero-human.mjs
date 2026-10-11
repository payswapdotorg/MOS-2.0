// PROD-004 — clause 15: the zero-human alternative. The SAME mission driven
// through the loop with the human-task steps replaced by their DECLARED
// zero-human alternates. Runs as a separately-runnable variant
// (`node harness/mos-closed-loop-proof.mjs --zero-human`) AND is exercised
// inside the full proof so clause 15 carries its own citation.

import { clause13 } from './clauses-b.mjs';

export async function clause15(scenario, rec) {
  // The alternate is DECLARED and substituted at the human-task port — the
  // rest of the loop is identical (same mission id, same corpus, same seeds).
  await clause13(scenario, rec, { zeroHuman: true });
  const task = scenario.humanTask;
  if (task.assignment !== 'declared-zero-human-alternate') {
    throw new Error('clause 15: zero-human alternate not declared at the port');
  }
  rec({
    id: 15, // recorded by the runner via clause13's own line; keep title here:
    title: 'zero-human alternative',
    citation: `same mission ${scenario.mission.id} driven with human-task steps replaced by declared alternates (${task.taskId})`,
    suppress: true, // the clause-13 line above already carries the citation detail
  });
}

// PROD-004 — transcript recording, §30-attributable trail digest, and the
// final gate line.

import { digest, DISCLOSED_ASSUMPTIONS } from './ports.mjs';

export function createRecorder() {
  const steps = [];
  const trailEvents = [];
  // TL-reconciled (battery round 1): the clause files call the recorder
  // directly — rec({...}) — so the recorder is a callable that also carries
  // the trail/transcript surface.
  const callable = (step) => { if (!step?.suppress) steps.push(step); };
  return Object.assign(callable, {
    steps, trailEvents,
    rec(step) { if (!step?.suppress) steps.push(step); },
    trail(event) { trailEvents.push({ ...event, at: trailEvents.length }); },
    lines() {
      const out = [];
      for (const s of steps) out.push(`[clause ${String(s.id).padStart(2, '0')}] ${s.title} — ${s.citation}`);
      return out;
    },
    trailDigest() {
      return digest(JSON.stringify(trailEvents));
    },
    transcript() {
      const lines = this.lines();
      lines.push(`trail-digest: ${this.trailDigest()}`);
      if (DISCLOSED_ASSUMPTIONS.length > 0) {
        lines.push('disclosed-assumptions:');
        for (const a of DISCLOSED_ASSUMPTIONS) lines.push(`  - ${a.pkg}#${a.export}: ${a.reason}`);
      }
      return lines.join('\n');
    },
  });
}

export function finalLine(passedCount, total, delta) {
  return `CLOSED-LOOP PROOF PASSED: ${passedCount}/${total} clauses, second run improved by ${delta}`;
}

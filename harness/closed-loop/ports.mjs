// PROD-004 — ports, doubles, deterministic primitives.
//
// DISCLOSED (PLAN C compat-pin pattern): exact constructor signatures of the
// authority surfaces are reconciled TL-side at battery time. Every authority
// access goes through `resolve()`, which records a DISCLOSED ASSUMPTION when a
// digest name is absent or not callable at runtime — the proof then runs on
// the narrow local port adapter and the TL station pins the real constructor.
// No fabricated certainty: the disclosure list is printed in the transcript.

export const DISCLOSED_ASSUMPTIONS = [];

// TL-side reconciliation: the source-default packages (exports map "." →
// ./src/index.ts) cannot be imported by plain node at runtime; their DIST
// builds are the runtime surface (the PROD-002 compat precedent). The
// dist-default packages keep their bare specifiers.
const DIST_RETARGET = {
  '@mos/missions': '../../packages/mos-missions/dist/index.js',
  '@mos/experiments': '../../packages/mos-experiments/dist/index.js',
  '@mos/lab': '../../packages/mos-lab/dist/index.js',
  '@mos/studio': '../../packages/mos-studio/dist/index.js',
  '@mos/content': '../../packages/mos-content/dist/index.js',
  '@mos/product-intelligence': '../../packages/mos-product-intelligence/dist/index.js',
};

export async function authority(pkg) {
  return import(DIST_RETARGET[pkg] ?? pkg);
}

/** Resolve a digest-named export; fall back to a labeled local adapter. */
export async function resolve(pkgName, exportName, fallbackFactory, why) {
  let mod;
  try {
    mod = await authority(pkgName);
  } catch (err) {
    DISCLOSED_ASSUMPTIONS.push({ pkg: pkgName, export: exportName, reason: `import failed: ${err.code ?? err.message}` });
    return fallbackFactory();
  }
  const value = mod[exportName];
  if (value !== undefined && value !== null) {
    if (typeof value === 'function' && !fallbackFactory.__allowValue) {
      // Presence check passed; shape check is TL-side. Use as-is.
      return value;
    }
    return value;
  }
  DISCLOSED_ASSUMPTIONS.push({ pkg: pkgName, export: exportName, reason: why ?? 'name absent at runtime; local port adapter used' });
  return fallbackFactory();
}

// ---------------------------------------------------------------------------
// Deterministic primitives (fixed seeds/clocks through declared ports)
// ---------------------------------------------------------------------------

/** Fixed clock: strictly increasing ms timestamps from a fixed epoch. */
export function fixedClock(epoch = 1735689600000) {
  let t = epoch;
  return () => (t += 1000);
}

/** Deterministic LCG RNG — fixed seed, declared port. */
export function seededRng(seed = 20250616) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ---------------------------------------------------------------------------
// In-memory doubles — TRANSPORT/IO-BOUND PORTS ONLY (disclosed)
// ---------------------------------------------------------------------------

/**
 * In-memory social transport double.
 * DOUBLES: the transport port behind @mos/distribution's binding surface.
 * LAW PRESERVED: rights/policy gates precede transport; a denial means
 * ZERO transport calls — the double counts calls so the proof ASSERTS the
 * zero-call invariant rather than trusting it.
 */
export function createInMemoryTransportDouble() {
  const calls = [];
  const double = {
    label: 'in-memory-transport-double(@mos/distribution transport port)',
    get callCount() { return calls.length; },
    calls,
    async send(envelope) {
      calls.push(structuredClone(envelope));
      return { accepted: true, receiptId: `rcpt-${calls.length}` };
    },
  };
  return double;
}

/**
 * In-memory durable job queue double.
 * DOUBLES: the JobQueuePort enqueue/claim/complete/fail path of @mos/jobs
 * (JOBS-001). LAW PRESERVED: enqueue/claim/complete state machine and the
 * DURABLE_JOB_EVENT_TYPES vocabulary are asserted, not simulated loosely;
 * side effects are countable for the clause-21 zero-side-effect assertion.
 */
export function createInMemoryJobQueueDouble() {
  const jobs = new Map();
  let seq = 0;
  return {
    label: 'in-memory-durable-job-queue-double(@mos/jobs JobQueuePort)',
    get enqueuedCount() { return jobs.size; },
    async enqueue(kind, payload) {
      seq += 1;
      const id = `job-${seq}`;
      jobs.set(id, { id, kind, payload, status: 'queued', events: [{ type: 'enqueued', kind }] });
      return id;
    },
    async claim(id) {
      const j = jobs.get(id);
      if (!j || j.status !== 'queued') return null;
      j.status = 'claimed';
      return j;
    },
    async complete(id) { const j = jobs.get(id); if (j) j.status = 'completed'; },
    async fail(id) { const j = jobs.get(id); if (j) j.status = 'failed'; },
    snapshot: () => [...jobs.values()].map(({ id, kind, status }) => ({ id, kind, status })),
  };
}

// ---------------------------------------------------------------------------
// Narrow local port adapters (uncertain constructors — DISCLOSED at resolve)
// ---------------------------------------------------------------------------

/** FNV-1a 64-bit-ish hex digest — deterministic transcript hashing. */
export function digest(text) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(text, 'utf8')) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Verbatim typed-rejection capture: name + message + attribution, as a VALUE. */
export function captureRejection(err) {
  return {
    name: err?.name ?? 'UnknownError',
    message: String(err?.message ?? err ?? ''),
    attribution: err?.attribution ?? err?.code ?? null,
  };
}

export function labeledAdapter(label, impl) {
  const fn = (...args) => impl(...args);
  fn.label = label;
  return fn;
}

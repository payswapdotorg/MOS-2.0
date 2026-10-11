# PROD-002 — Experiment / Evidence / Learning (§24 chain tail)

Module topology (frozen registry, unchanged): root `packages/mos-experiments`,
owner worker-c, authority `real-experiment-evidence-learning`,
dependencies [contracts, missions, production, distribution, jobs].
This submodule is ADDITIVE to BRIDGE-003's RealExperimentBinding surface.

Chain: platform → (PROD-001 binding) → platform-said observations →
measured evidence (§22 intervals, §24 citations) → learning records
(LAB-018 prediction-error inputs) — closing the §2 loop.

Laws enforced structurally in this submodule:
- Evidence derives ONLY from `source: 'platform-said'` records (§24).
- Counterfactual/simulated values are branded OUT of the measured learning
  channel (§20/§24) — compile-time and runtime pin-tested.
- provider-CONFIRMED and SUSPECTED health evidence are stratified, never
  pooled (HEALTH-001 restriction typing).
- Every metric estimate carries an uncertainty interval — never a bare
  point (§22).
- Lifecycle (proposed→running→collecting→measured→learned|aborted) is
  state-machined and rides the durable @mos/jobs path (§26).
- All record access is tenant-partitioned and rights-gated; denials carry
  the authority's attribution verbatim (§27/§31/§30).

Upstream shape assumptions live in exactly two files:
`compat-pins.ts` (compile-time pins) and `upstream.ts` (runtime adaptation).
```

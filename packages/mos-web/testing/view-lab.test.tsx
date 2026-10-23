/**
 * Lab surface render tests (UX-003) — render-LEVEL only (static
 * render-tree walk, no DOM, no browser claim; full browser acceptance is
 * UX-006). Covers: the benchmark directory rows (counterfactual badge,
 * §31 tenant display, calibration-citation states), the benchmark digest
 * (DECLARED policy, fairness pin, the ALWAYS-present no-op baseline, every
 * expected value WITH its interval — §22 —, per-world disagreement, OOD
 * flags, calibration pending), the calibration status rows (context derived
 * vs the first-class pending state), the calibration record detail
 * (prediction COUNTERFACTUAL vs observation MEASURED — lock rule 29 —,
 * the frozen v1 functional, the §24 statement) — and the UX-003 wave-3
 * write-intent transport surfaces: every write-capable section renders its
 * Lab intent forms, and the ONLY operator controls anywhere on the Lab
 * surface are those forms' DECLARE submits (never a control that could
 * imply direct execution — the authorities own every write).
 *
 * View fixtures are derived ONCE from the disclosed composition doubles
 * (plain view models — the shapes the ports return), mirroring the studio
 * view-fixture discipline.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@mos/contracts";
import {
  LabBenchmarkDigestPanel,
  LabBenchmarkDirectoryView,
  LabCalibrationDetailPanel,
  LabCalibrationStatusView,
  LabView,
} from "../dist/src/index.js";
import type {
  LabBenchmarkDigestView,
  LabBenchmarkSummaryView,
} from "../dist/src/ports/lab-benchmark.js";
import type {
  LabCalibrationChainView,
  LabCalibrationRecordView,
} from "../dist/src/ports/lab-calibration.js";
import type { LabSimulatorOverviewView } from "../dist/src/ports/lab-simulator.js";
import type {
  LabOrganizationSearchResultView,
  LabStrategyCandidateView,
} from "../dist/src/ports/lab-strategy.js";
import type { LabPageData } from "../dist/src/routes/route-loading.js";
import { createInMemoryLabSurface } from "./in-memory-lab-surface.js";
import { createInMemoryLabWorkspace } from "./in-memory-lab-workspace.js";
import { elementWithTestId, elementsWithTag, linkHrefs, renderTreeText } from "./render-tree.js";

const NOOP_ON_DECLARE_LAB_INTENT = (): void => undefined;
const DEMO_SCOPE: TenantScope = {
  tenantId: "tenant-demo" as never,
  workspaceId: "ws_demo" as never,
};

const surface = createInMemoryLabSurface();

const summariesResult = await surface.labBenchmark.listBenchmarkSummaries(DEMO_SCOPE);
if ("error" in summariesResult) {
  throw new Error(`view fixtures could not load benchmark summaries: ${summariesResult.message}`);
}
const BENCHMARKS: readonly LabBenchmarkSummaryView[] = summariesResult;

const digestResult = await surface.labBenchmark.loadBenchmarkDigest(
  "bench-reach-v1",
  1,
  DEMO_SCOPE,
);
if ("error" in digestResult) {
  throw new Error(`view fixtures could not load the digest: ${digestResult.message}`);
}
const DIGEST: LabBenchmarkDigestView = digestResult;

const chainsResult = await surface.labCalibration.listCalibrationChains(DEMO_SCOPE);
if ("error" in chainsResult) {
  throw new Error(`view fixtures could not load calibration chains: ${chainsResult.message}`);
}
const CHAINS: readonly LabCalibrationChainView[] = chainsResult;

const recordsResult = await surface.labCalibration.loadCalibrationRecords(
  "calib-reach-1",
  DEMO_SCOPE,
);
if ("error" in recordsResult) {
  throw new Error(`view fixtures could not load calibration records: ${recordsResult.message}`);
}
const CALIB_RECORDS: readonly LabCalibrationRecordView[] = recordsResult;

// The wave-2/3 workspace fixtures (simulator + strategy sections) come from
// the disclosed workspace double — same discipline, plain port view models.
const workspace = createInMemoryLabWorkspace();
const simulatorResult = await workspace.labSimulator.loadSimulatorOverview(DEMO_SCOPE);
if ("error" in simulatorResult) {
  throw new Error(
    `view fixtures could not load the simulator overview: ${simulatorResult.message}`,
  );
}
const SIMULATOR: LabSimulatorOverviewView = simulatorResult;

const strategyCandidatesResult = await workspace.labStrategy.listStrategyCandidates(DEMO_SCOPE);
if ("error" in strategyCandidatesResult) {
  throw new Error(
    `view fixtures could not load strategy candidates: ${strategyCandidatesResult.message}`,
  );
}
const STRATEGY_CANDIDATES: readonly LabStrategyCandidateView[] = strategyCandidatesResult;

const organizationSearchesResult =
  await workspace.labStrategy.listOrganizationSearchResults(DEMO_SCOPE);
if ("error" in organizationSearchesResult) {
  throw new Error(
    `view fixtures could not load organization searches: ${organizationSearchesResult.message}`,
  );
}
const ORG_SEARCHES: readonly LabOrganizationSearchResultView[] = organizationSearchesResult;

const labPage = (overrides: Partial<LabPageData> = {}): LabPageData => ({
  scope: DEMO_SCOPE,
  section: "benchmarks",
  intentOutcome: null,
  intentOutcomeError: null,
  overview: null,
  overviewError: null,
  corpusSummaries: null,
  selectedCorpus: null,
  corpusSelectionError: null,
  ideaGraph: null,
  selectedIdea: null,
  ideaSelectionError: null,
  simulator: null,
  selectedRun: null,
  runSelectionError: null,
  selectedBranchRecords: null,
  branchSelectionError: null,
  strategyCandidates: null,
  organizationSearches: null,
  rewardObjective: null,
  strategyError: null,
  selectedCandidate: null,
  candidateSelectionError: null,
  transformDefinitions: null,
  transformGraphs: null,
  transformCandidates: null,
  transformsError: null,
  selectedTransformCandidate: null,
  transformSelectionError: null,
  benchmarks: BENCHMARKS,
  selectedDigest: null,
  benchmarkSelectionError: null,
  calibrationChains: CHAINS,
  calibrationError: null,
  selectedCalibrationRecords: null,
  calibrationSelectionError: null,
  bridgeDirectory: null,
  bridgeError: null,
  selectedHandoff: null,
  handoffSelectionError: null,
  ...overrides,
});

const noTenantLabPage = labPage({ scope: null, benchmarks: [], calibrationChains: [] });

test("the Lab page without a tenant scope renders the explicit no-tenant view", () => {
  const tree = <LabView data={noTenantLabPage} onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT} />;
  assert.ok(elementWithTestId(tree, "missions-no-tenant"));
});

test("the Lab page narrates the learning-loop position and the standing §24 boundary note", () => {
  const tree = <LabView data={labPage()} onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT} />;
  const text = renderTreeText(tree);
  assert.equal(text.includes("Learning loop"), true);
  assert.equal(text.includes("counterfactual"), true);
  const note = elementWithTestId(tree, "lab-boundary-note");
  assert.ok(note);
  assert.equal(
    renderTreeText(note).includes("never deployment evidence"),
    true,
    "the §24 statement stands at the top of the surface",
  );
});

test("benchmark rows are digest links with the counterfactual badge and explicit tenant (§31/§20)", () => {
  const tree = (
    <LabBenchmarkDirectoryView
      benchmarks={BENCHMARKS}
      selectedBenchmarkId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const reachRow = elementWithTestId(tree, "lab-benchmark-row-bench-reach-v1");
  assert.ok(reachRow);
  assert.equal(reachRow.type, "a");
  assert.equal(reachRow.props.href, "/lab?benchmark=bench-reach-v1");
  const text = renderTreeText(reachRow);
  assert.equal(text.includes("sourdough-baking"), true);
  assert.equal(text.includes("short-video"), true);
  assert.equal(text.includes("policy-robust-reach v1"), true);
  assert.equal(
    text.includes("no-op baseline"),
    true,
    "the row states the baseline is always included",
  );
  assert.equal(text.includes("tenant-demo"), true, "§31: the tenant is explicit in the row");
  assert.ok(elementWithTestId(tree, "lab-benchmark-counterfactual-bench-reach-v1"));
});

test("a benchmark row shows its calibration citation; a first-run row shows the pending state", () => {
  const tree = (
    <LabBenchmarkDirectoryView
      benchmarks={BENCHMARKS}
      selectedBenchmarkId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const cited = elementWithTestId(tree, "lab-benchmark-calibration-bench-reach-v1");
  assert.ok(cited);
  assert.equal(
    renderTreeText(cited).includes("cites calibration context v1"),
    true,
    "the closed loop citation renders (provenance only)",
  );
  const pending = elementWithTestId(tree, "lab-benchmark-calibration-bench-launch-v2");
  assert.ok(pending);
  assert.equal(
    renderTreeText(pending).includes("Calibration pending reality"),
    true,
    "the LAB-018 seam state renders as pending, never as a number",
  );
});

test("the selected benchmark row is marked aria-current (keyboard/AT pin)", () => {
  const tree = (
    <LabBenchmarkDirectoryView
      benchmarks={BENCHMARKS}
      selectedBenchmarkId="bench-reach-v1"
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const row = elementWithTestId(tree, "lab-benchmark-row-bench-reach-v1");
  assert.equal(row?.props["aria-current"], "page");
});

test("the empty benchmark directory is an explicit empty state, never placeholder rows", () => {
  const tree = (
    <LabBenchmarkDirectoryView
      benchmarks={[]}
      selectedBenchmarkId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const empty = elementWithTestId(tree, "lab-benchmarks-empty");
  assert.ok(empty);
  assert.equal(renderTreeText(empty).includes("does not fabricate examples"), true);
});

test("the digest header carries the counterfactual badge, integrity state and §24 statement", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  assert.ok(
    elementWithTestId(tree, "lab-digest-counterfactual"),
    "the digest is visibly counterfactual",
  );
  const integrity = elementWithTestId(tree, "lab-digest-integrity");
  assert.ok(integrity);
  assert.equal(renderTreeText(integrity).includes("intact"), true);
  const boundary = elementWithTestId(tree, "lab-digest-boundary-note");
  assert.ok(boundary);
  assert.equal(renderTreeText(boundary).includes("NOT deployment evidence"), true);
  assert.ok(elementWithTestId(tree, "lab-digest-tenant"), "§31: the digest names its tenant");
});

test("the digest renders the DECLARED robustness policy with the world-model set", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const policy = elementWithTestId(tree, "lab-digest-policy");
  assert.ok(policy);
  const text = renderTreeText(policy);
  assert.equal(text.includes("policy-robust-reach v1"), true);
  assert.equal(text.includes("4 seeds"), true);
  assert.equal(text.includes("primary=ensemble-reach-primary v3"), true);
  assert.equal(text.includes("pessimistic=ensemble-reach-pessimistic v2"), true);
  assert.equal(text.includes("Pooled mean over all worlds"), true);
  assert.equal(text.includes("expected-desc-halfwidth-asc-key-asc"), true);
});

test("the digest renders the fairness pin statement verbatim (cross-candidate fairness)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const fairness = elementWithTestId(tree, "lab-digest-fairness");
  assert.ok(fairness);
  assert.equal(
    renderTreeText(fairness).includes("no per-candidate condition cherry-picking"),
    true,
  );
});

test("EVERY candidate renders its expected value WITH its interval (§22 — never bare points)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const all = [DIGEST.noopBaseline, ...DIGEST.declaredCandidates];
  for (const candidate of all) {
    const expected = elementWithTestId(tree, `lab-candidate-expected-${candidate.key}`);
    assert.ok(expected, `candidate ${candidate.key} renders its expected-value line`);
    const text = renderTreeText(expected);
    assert.equal(text.includes("expected "), true, `${candidate.key}: the expected value renders`);
    assert.equal(
      text.includes("interval ["),
      true,
      `${candidate.key}: the interval renders WITH the expected value`,
    );
    assert.equal(
      text.includes(
        `[${candidate.interval.lower.toFixed(2)}, ${candidate.interval.upper.toFixed(2)}]`,
      ),
      true,
      `${candidate.key}: the interval numbers are the port's numbers`,
    );
  }
});

test("EVERY candidate carries a visible counterfactual badge (§20/§24 pin)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const all = [DIGEST.noopBaseline, ...DIGEST.declaredCandidates];
  for (const candidate of all) {
    const badge = elementWithTestId(tree, `lab-candidate-counterfactual-${candidate.key}`);
    assert.ok(badge, `${candidate.key}: the counterfactual label renders as a badge`);
    assert.equal(renderTreeText(badge).toLowerCase().includes("counterfactual"), true);
  }
});

test("the no-op baseline is visibly THE baseline (§7) and explains itself", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const mark = elementWithTestId(tree, "lab-noop-baseline-mark");
  assert.ok(mark);
  assert.equal(renderTreeText(mark).includes("No-op baseline (always present)"), true);
  const baseline = elementWithTestId(tree, "lab-candidate-noop-baseline");
  assert.ok(baseline);
  assert.equal(renderTreeText(baseline).includes("This IS the baseline"), true);
});

test("the OOD flag renders with per-world distances (§22 — the flagged candidate)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const ood = elementWithTestId(tree, "lab-candidate-ood-clip-5");
  assert.ok(ood);
  assert.equal(renderTreeText(ood).includes("Out of declared coverage"), true);
  const worlds = elementWithTestId(tree, "lab-candidate-worlds-clip-5");
  assert.ok(worlds);
  assert.equal(renderTreeText(worlds).includes("worst 21.80"), true);
  assert.equal(renderTreeText(worlds).includes("best 27.40"), true);
});

test("per-world member disagreement renders, never hidden by aggregation (§22)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const disagreement = elementWithTestId(tree, "lab-candidate-disagreement-clip-5");
  assert.ok(disagreement);
  const text = renderTreeText(disagreement);
  assert.equal(text.includes("worst half-width"), true);
  assert.equal(text.includes("primary: ±1.50"), true);
  assert.equal(text.includes("pessimistic: ±0.60"), true);
});

test("the baseline comparison renders the delta against the always-present no-op (§7)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const comparison = elementWithTestId(tree, "lab-candidate-baseline-comparison-clip-5");
  assert.ok(comparison);
  const text = renderTreeText(comparison);
  assert.equal(text.includes("baseline expected 8.20"), true);
  assert.equal(text.includes("delta 16.40"), true);
  assert.equal(text.includes("overlap"), true);
});

test("every candidate shows the calibration-pending badge (the LAB-018 seam)", () => {
  const tree = <LabBenchmarkDigestPanel digest={DIGEST} />;
  const all = [DIGEST.noopBaseline, ...DIGEST.declaredCandidates];
  for (const candidate of all) {
    const badge = elementWithTestId(tree, `lab-candidate-calibration-${candidate.key}`);
    assert.ok(badge, `${candidate.key}: calibration pending renders`);
    assert.equal(renderTreeText(badge).includes("Calibration pending reality"), true);
  }
});

test("calibration chain rows link to their records with integrity and context states", () => {
  const tree = (
    <LabCalibrationStatusView
      chains={CHAINS}
      selectedCalibrationId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const reachRow = elementWithTestId(tree, "lab-calibration-row-calib-reach-1");
  assert.ok(reachRow);
  assert.equal(reachRow.type, "a");
  assert.equal(reachRow.props.href, "/lab?calibration=calib-reach-1");
  assert.ok(elementWithTestId(tree, "lab-calibration-integrity-calib-reach-1"));
  assert.equal(
    renderTreeText(elementWithTestId(tree, "lab-calibration-tenant") ?? tree).includes(
      "tenant-demo",
    ),
    true,
    "§31: the calibration rows are tenant-explicit",
  );
});

test("a derived context renders its version and summary (calibration ACTIVE)", () => {
  const tree = (
    <LabCalibrationStatusView
      chains={CHAINS}
      selectedCalibrationId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const context = elementWithTestId(tree, "lab-calibration-context-calib-reach-1");
  assert.ok(context);
  const text = renderTreeText(context);
  assert.equal(text.includes("Context v1 derived"), true);
  assert.equal(text.includes("2 error records"), true);
  assert.equal(text.includes("bias -2.90"), true);
  assert.equal(text.includes("interval coverage 0.50"), true);
});

test("a chain without a context renders the FIRST-CLASS pending state (never fabricated)", () => {
  const tree = (
    <LabCalibrationStatusView
      chains={CHAINS}
      selectedCalibrationId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const pending = elementWithTestId(tree, "lab-calibration-pending-calib-launch-1");
  assert.ok(pending);
  assert.equal(renderTreeText(pending).includes("Calibration pending"), true);
  assert.equal(renderTreeText(pending).includes("declared pending reality"), true);
});

test("the empty calibration status is an explicit empty state", () => {
  const tree = (
    <LabCalibrationStatusView
      chains={[]}
      selectedCalibrationId={null}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const empty = elementWithTestId(tree, "lab-calibrations-empty");
  assert.ok(empty);
  assert.equal(renderTreeText(empty).includes("does not fabricate"), true);
});

test("the calibration detail separates the COUNTERFACTUAL prediction from the MEASURED reality (rule 29)", () => {
  const tree = <LabCalibrationDetailPanel records={CALIB_RECORDS} />;
  const v1Prediction = elementWithTestId(tree, "lab-calibration-prediction-calib-reach-1-v1");
  assert.ok(v1Prediction);
  assert.ok(
    elementWithTestId(tree, "lab-calibration-prediction-counterfactual-calib-reach-1-v1"),
    "the prediction side carries the counterfactual badge",
  );
  const v1Observed = elementWithTestId(tree, "lab-calibration-observed-calib-reach-1-v1");
  assert.ok(v1Observed);
  assert.ok(
    elementWithTestId(tree, "lab-calibration-observed-measured-calib-reach-1-v1"),
    "the observation side carries the measured badge",
  );
  const predictionText = renderTreeText(v1Prediction);
  assert.equal(predictionText.includes("interval ["), true, "the prediction renders its interval");
  assert.equal(
    predictionText.includes("bench-reach-v1 v1"),
    true,
    "the cited benchmark record is named",
  );
  const observedText = renderTreeText(v1Observed);
  assert.equal(observedText.includes("observed outcome 17.20"), true);
  assert.equal(observedText.includes("historical observation"), true);
  assert.equal(observedText.includes("never lab-simulated data"), true, "§20 discipline stated");
});

test("the error decomposition, containment and frozen functional render per record", () => {
  const tree = <LabCalibrationDetailPanel records={CALIB_RECORDS} />;
  const signed = elementWithTestId(tree, "lab-calibration-signed-error-calib-reach-1-v1");
  assert.ok(signed);
  assert.equal(renderTreeText(signed).includes("-7.40"), true);
  assert.equal(renderTreeText(signed).includes("over-estimated reality"), true);
  const containment = elementWithTestId(tree, "lab-calibration-containment-calib-reach-1-v1");
  assert.ok(containment);
  assert.equal(renderTreeText(containment).includes("OUTSIDE"), true);
  const containmentV2 = elementWithTestId(tree, "lab-calibration-containment-calib-reach-1-v2");
  assert.ok(containmentV2);
  assert.equal(renderTreeText(containmentV2).includes("INSIDE"), true);
  const functional = elementWithTestId(tree, "lab-calibration-functional-calib-reach-1-v1");
  assert.ok(functional);
  assert.equal(renderTreeText(functional).includes("calib-signed-error-v1 v1"), true);
  assert.ok(
    elementWithTestId(tree, "lab-calibration-labonly"),
    "the §24 statement renders per record",
  );
});

test("the benchmarks section page renders directory and digest together honestly", () => {
  const tree = (
    <LabView
      data={labPage({
        selectedDigest: DIGEST,
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, "lab-benchmarks-list"));
  assert.ok(elementWithTestId(tree, "lab-benchmark-digest"));
  assert.ok(elementWithTestId(tree, "lab-nav-benchmarks"), "the workspace nav renders");
  assert.ok(elementWithTestId(tree, "lab-workspace-nav"), "the workspace section rail is present");
});

test("the calibration section page renders the chains and records together honestly", () => {
  const tree = (
    <LabView
      data={labPage({
        section: "calibration",
        selectedCalibrationRecords: CALIB_RECORDS,
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, "lab-calibrations-list"));
  assert.ok(elementWithTestId(tree, "lab-calibration-detail"));
});

test("selection failures render their honest panels, never guessed data", () => {
  const benchmarkTree = (
    <LabView
      data={labPage({
        benchmarkSelectionError: "lab-benchmark-not-found",
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const benchmarkError = elementWithTestId(benchmarkTree, "lab-benchmark-selection-error");
  assert.ok(benchmarkError);
  assert.equal(benchmarkError.props.role, "alert");
  assert.equal(renderTreeText(benchmarkError).includes("cannot tell and will not guess"), true);

  const calibrationTree = (
    <LabView
      data={labPage({
        section: "calibration",
        calibrationSelectionError: "lab-calibration-not-found",
        calibrationError: "load-failed",
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(calibrationTree, "lab-calibration-selection-error"));
  const calibrationUnavailable = elementWithTestId(calibrationTree, "lab-calibration-unavailable");
  assert.ok(calibrationUnavailable);
  assert.equal(renderTreeText(calibrationUnavailable).includes("explicitly unavailable"), true);
});

/* ---------- UX-003 wave 3: the write-intent declaration surfaces ---------- */

test("the simulator section renders its two intent forms; forking stays a declared affordance", () => {
  const tree = (
    <LabView
      data={labPage({ section: "simulator", simulator: SIMULATOR })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, "lab-simulator-intent-step"), "the step form renders");
  assert.ok(elementWithTestId(tree, "lab-simulator-intent-step-submit"), "the step form submits");
  assert.ok(elementWithTestId(tree, "lab-simulator-intent-register"), "the register form renders");
  assert.ok(
    elementWithTestId(tree, "lab-simulator-intent-register-submit"),
    "the register form submits",
  );
  // Both forms carry the verbatim routing vocabulary + the counterfactual law.
  const sectionText = renderTreeText(tree);
  assert.equal(sectionText.includes("lab-simulator-authority"), true);
  assert.equal(sectionText.includes("never measured"), true);
  // The retired read-only step affordance is gone; forking STAYS a
  // disabled-with-reason declared affordance (outside this transport's scope).
  assert.equal(elementWithTestId(tree, "lab-simulator-affordance-step"), null);
  const fork = elementWithTestId(tree, "lab-simulator-affordance-fork");
  assert.ok(fork);
  assert.equal(fork.props.disabled, true, "the fork affordance never enables");
});

test("the strategy section renders its search + learn intent forms with their authorities", () => {
  const tree = (
    <LabView
      data={labPage({
        section: "strategy",
        strategyCandidates: STRATEGY_CANDIDATES,
        organizationSearches: ORG_SEARCHES,
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, "lab-strategy-intent-search"), "the search form renders");
  assert.ok(
    elementWithTestId(tree, "lab-strategy-intent-search-submit"),
    "the search form submits",
  );
  assert.ok(elementWithTestId(tree, "lab-strategy-intent-learn"), "the learn form renders");
  assert.ok(elementWithTestId(tree, "lab-strategy-intent-learn-submit"), "the learn form submits");
  // Each form names the authority it routes to, verbatim port vocabulary.
  const sectionText = renderTreeText(tree);
  assert.equal(sectionText.includes("lab-organization-search-authority"), true);
  assert.equal(sectionText.includes("lab-strategy-learning-authority"), true);
  // The frozen-ensemble gate is disclosed up front (unknown-ensemble).
  assert.equal(sectionText.includes("unknown-ensemble"), true);
  // The retired read-only affordances are gone entirely.
  assert.equal(elementWithTestId(tree, "lab-strategy-affordance-learn"), null);
  assert.equal(elementWithTestId(tree, "lab-strategy-affordance-search"), null);
});

test("the benchmarks section renders the run-benchmark intent form beside the directory", () => {
  const tree = (
    <LabView
      data={labPage({ selectedDigest: DIGEST })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, "lab-benchmarks-list"));
  assert.ok(elementWithTestId(tree, "lab-benchmarks-intent-run"), "the run form renders");
  const submit = elementWithTestId(tree, "lab-benchmarks-intent-run-submit");
  assert.ok(submit, "the run form submits");
  assert.equal(submit?.props.type, "submit");
  // The form names its authority and the always-present no-op baseline.
  const formText = renderTreeText(elementWithTestId(tree, "lab-benchmarks-intent-run"));
  assert.equal(formText.includes("lab-benchmark-authority"), true);
  assert.equal(formText.includes("no-op baseline"), true);
});

test("the calibration section renders the record-calibration intent form beside the chains", () => {
  const tree = (
    <LabView
      data={labPage({
        section: "calibration",
        selectedCalibrationRecords: CALIB_RECORDS,
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, "lab-calibrations-list"));
  assert.ok(elementWithTestId(tree, "lab-calibration-intent-record"), "the record form renders");
  const submit = elementWithTestId(tree, "lab-calibration-intent-record-submit");
  assert.ok(submit, "the record form submits");
  assert.equal(submit?.props.type, "submit");
  // The form names its authority + the frozen LAB-017 record it resolves against.
  const formText = renderTreeText(elementWithTestId(tree, "lab-calibration-intent-record"));
  assert.equal(formText.includes("lab-calibration-authority"), true);
  assert.equal(formText.includes("LAB-017"), true);
});

test("the ONLY operator controls on the Lab surface are intent-form DECLARE submits", () => {
  // The wave-3 evolution of the read-only pin: the surface still never
  // executes anything itself — every button anywhere on a write-capable
  // section page is an intent form's submit (the declaration handoff), and
  // any declared-affordance button stays disabled. Running benchmarks,
  // recording calibration, stepping simulations and searching organizations
  // remain lab-authority actions reached ONLY through declared intents.
  const sectionPages = [
    <LabView
      data={labPage({ section: "simulator", simulator: SIMULATOR })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />,
    <LabView
      data={labPage({
        section: "strategy",
        strategyCandidates: STRATEGY_CANDIDATES,
        organizationSearches: ORG_SEARCHES,
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />,
    <LabView
      data={labPage({ selectedDigest: DIGEST })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />,
    <LabView
      data={labPage({
        section: "calibration",
        selectedCalibrationRecords: CALIB_RECORDS,
      })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />,
  ];
  // The §6 universal-composer wave (UXR-WC) adds exactly ONE more control
  // per owning section: the "Ask MOS — <action>" entry. It is a DECLARE-path
  // affordance, not an execution control — it opens the shell-owned composer
  // whose confirm routes the SAME declaration (built by the SAME parser)
  // through the SAME onDeclareLabIntent callback (pinned in
  // view-composer.test.tsx).
  for (const tree of sectionPages) {
    for (const button of elementsWithTag(tree, "button")) {
      const testId = button.props["data-testid"];
      const isIntentSubmit = typeof testId === "string" && testId.endsWith("-submit");
      const isDisabledAffordance = button.props.disabled === true;
      const isComposerEntry =
        typeof testId === "string" && testId.startsWith("lab-ask-mos-");
      assert.equal(
        isIntentSubmit || isDisabledAffordance || isComposerEntry,
        true,
        `every button declares an intent, opens the composer, or stays a disabled affordance: ${String(testId)}`,
      );
      if (isIntentSubmit) {
        assert.equal(button.props.type, "submit", "the intent control is a form submit");
      }
    }
  }
});

test("every navigation affordance on the Lab surface is a real link (keyboard reachable)", () => {
  const benchmarkTree = (
    <LabView
      data={labPage({ selectedDigest: DIGEST })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const benchmarkHrefs = linkHrefs(benchmarkTree);
  assert.equal(benchmarkHrefs.includes("/lab?benchmark=bench-reach-v1"), true);
  for (const href of benchmarkHrefs) {
    assert.equal(href.startsWith("/lab") || href === "/", true, `internal links only: ${href}`);
  }

  const calibrationTree = (
    <LabView
      data={labPage({ section: "calibration", selectedCalibrationRecords: CALIB_RECORDS })}
      onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT}
    />
  );
  const calibrationHrefs = linkHrefs(calibrationTree);
  assert.equal(calibrationHrefs.includes("/lab?calibration=calib-reach-1"), true);
  assert.equal(calibrationHrefs.includes("/lab?calibration=calib-launch-1"), true);

  // The workspace rail links every section as a real href
  const railTree = <LabView data={labPage({})} onDeclareLabIntent={NOOP_ON_DECLARE_LAB_INTENT} />;
  const railHrefs = linkHrefs(railTree);
  for (const sectionHref of [
    "/lab",
    "/lab?section=corpus",
    "/lab?section=idea-graph",
    "/lab?section=simulator",
    "/lab?section=strategy",
    "/lab?section=transforms",
    "/lab?section=benchmarks",
    "/lab?section=calibration",
    "/lab?section=bridge",
  ]) {
    assert.equal(railHrefs.includes(sectionHref), true, `the rail links ${sectionHref}`);
  }
});

/**
 * In-memory BenchmarkCorpusRegistry adapter (ENG-004).
 *
 * Versioned, immutable golden corpora: fail-closed registration
 * validation (required fields, non-empty cases, inputs AND expected
 * outputs per case, unique case ids), duplicate (id, version)
 * rejection, exact-version retrieval (never "latest"), ascending version
 * history. In-memory scaffold (disclosed) — durable corpus storage is a
 * TL/composition-root concern.
 */

import type {
  BenchmarkCorpusRef,
  Version,
} from "@mos/contracts";

import { BenchmarkError } from "../domain/errors.js";
import type {
  BenchmarkCorpus,
  BenchmarkCorpusRegistryPort,
} from "../ports/benchmark.port.js";

function corpusViolations(corpus: BenchmarkCorpus): readonly string[] {
  const violations: string[] = [];
  if (typeof corpus.id !== "string" || corpus.id.length === 0) {
    violations.push("id");
  }
  if (typeof corpus.version !== "number" || !Number.isInteger(corpus.version) || corpus.version < 1) {
    violations.push("version");
  }
  if (typeof corpus.capabilityId !== "string" || corpus.capabilityId.length === 0) {
    violations.push("capabilityId");
  }
  if (typeof corpus.capabilityVersion !== "number" || corpus.capabilityVersion < 1) {
    violations.push("capabilityVersion");
  }
  if (typeof corpus.evaluatorRef !== "string" || corpus.evaluatorRef.length === 0) {
    violations.push("evaluatorRef");
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    violations.push("cases:non-empty");
  }
  const caseIds = new Set<string>();
  for (const benchmarkCase of corpus.cases ?? []) {
    if (typeof benchmarkCase.caseId !== "string" || benchmarkCase.caseId.length === 0) {
      violations.push(`cases:${benchmarkCase.caseId ?? "?"}:caseId`);
    }
    if (caseIds.has(benchmarkCase.caseId)) {
      violations.push(`cases:${benchmarkCase.caseId}:duplicate-case-id`);
    }
    caseIds.add(benchmarkCase.caseId);
    if (benchmarkCase.inputArtifactRefs.length === 0) {
      violations.push(`cases:${benchmarkCase.caseId}:inputs-non-empty`);
    }
    if (benchmarkCase.expectedOutputArtifactRefs.length === 0) {
      violations.push(`cases:${benchmarkCase.caseId}:expected-outputs-non-empty`);
    }
  }
  return violations;
}

/**
 * Creates the in-memory {@link BenchmarkCorpusRegistryPort}.
 */
export function createInMemoryBenchmarkCorpusRegistry(): BenchmarkCorpusRegistryPort {
  /** corpus id (string key) → version → corpus. */
  const corpora = new Map<string, Map<number, BenchmarkCorpus>>();

  const registry: BenchmarkCorpusRegistryPort = {
    registerCorpus(corpus: BenchmarkCorpus): void {
      const violations = corpusViolations(corpus);
      if (violations.length > 0) {
        throw new BenchmarkError(
          "invalid-benchmark-corpus",
          `corpus record failed validation: ${violations.join(", ")}`,
          { violations },
        );
      }
      const idKey = corpus.id as string;
      let versions = corpora.get(idKey);
      if (versions === undefined) {
        versions = new Map<number, BenchmarkCorpus>();
        corpora.set(idKey, versions);
      }
      const versionKey = corpus.version as number;
      if (versions.has(versionKey)) {
        throw new BenchmarkError(
          "corpus-already-registered",
          `corpus ${idKey} version ${versionKey} is already registered; corpora are immutable — register a new version instead`,
          { corpusId: idKey, version: versionKey },
        );
      }
      versions.set(versionKey, Object.freeze({ ...corpus }));
    },

    getCorpus(
      id: BenchmarkCorpusRef,
      version: Version,
    ): BenchmarkCorpus | undefined {
      return corpora.get(id as string)?.get(version as number);
    },

    listCorpusVersions(id: BenchmarkCorpusRef): readonly Version[] {
      const versions = corpora.get(id as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },
  };

  return registry;
}

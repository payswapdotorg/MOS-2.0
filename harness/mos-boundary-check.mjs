#!/usr/bin/env node
/**
 * MOS substrate boundary check — W0-B / BOOT-003.
 *
 * Zero-dependency static import firewall for MOS-managed packages.
 * Rules are loaded from harness/mos-boundary-rules.json (machine-readable
 * authority; mirrors spec/mos-architecture-policy-v2.0.yaml and the ZCode
 * substrate firewall in docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md).
 *
 * Modes:
 *   node harness/mos-boundary-check.mjs             scan the real tree
 *   node harness/mos-boundary-check.mjs --self-test run fixture self-test
 *
 * Method (static analysis, disclosed limits):
 * - A lightweight tokenizer strips comments, skips regex/template contents
 *   and string data, then recognizes import/export-from/dynamic-import/
 *   require statements. Computed (non-literal) specifiers cannot be seen;
 *   that class requires a parser-based follow-up owned by the Tech Lead.
 * - Matching is by package ROOT (scope/name), never substring.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";

const harnessDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(harnessDir, "..");
const RULES_PATH = join(harnessDir, "mos-boundary-rules.json");
const FIXTURES_DIR = join(harnessDir, "fixtures");
const selfTest = process.argv.includes("--self-test");

// ---------------------------------------------------------------------------
// Tokenizer: comments -> dropped, strings -> string tokens, templates and
// regex literals -> skipped, identifiers/punct/numbers -> tokens.
// ---------------------------------------------------------------------------

const REGEX_CONTEXT_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await",
]);
const STATEMENT_STARTERS = new Set([
  "const", "let", "var", "function", "class", "if", "for", "while", "do",
  "switch", "return", "new", "delete", "throw", "try", "catch", "finally",
  "with", "enum", "namespace", "declare", "abstract", "export", "import",
  "await", "yield",
]);

function isIdentStart(c) {
  return /[A-Za-z_$]/.test(c);
}
function isIdentPart(c) {
  return /[A-Za-z0-9_$]/.test(c);
}

function regexAllowed(tokens) {
  const last = tokens[tokens.length - 1];
  if (!last) return true;
  if (last.type === "ident") return REGEX_CONTEXT_KEYWORDS.has(last.value);
  if (last.type === "string" || last.type === "number") return false;
  // punct: division follows ) ] ; regex otherwise (} assumed block end).
  return last.value === ")" || last.value === "]" ? false : true;
}

function tokenize(source) {
  const src = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const startLine = line;
      i++;
      let value = "";
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) { value += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === "\n") line++;
        value += src[i];
        i++;
      }
      i++;
      tokens.push({ type: "string", value, line: startLine });
      continue;
    }
    if (c === "`") {
      i++;
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "\n") line++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "/") {
      if (regexAllowed(tokens)) {
        i++;
        let inClass = false;
        while (i < n) {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === "\n") break;
          if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
          else if (src[i] === "/" && !inClass) break;
          i++;
        }
        while (i < n && /[a-z]/i.test(src[i]) && src[i] !== "\n") i++;
        continue;
      }
    }
    if (isIdentStart(c)) {
      const start = i;
      const startLine = line;
      while (i < n && isIdentPart(src[i])) i++;
      tokens.push({ type: "ident", value: src.slice(start, i), line: startLine });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const startLine = line;
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++;
      } else {
        while (i < n && /[0-9._]/.test(src[i])) i++;
        if (src[i] === "e" || src[i] === "E") {
          i++;
          if (src[i] === "+" || src[i] === "-") i++;
          while (i < n && /[0-9]/.test(src[i])) i++;
        }
      }
      tokens.push({ type: "number", value: "0", line: startLine });
      continue;
    }
    if ("(){}[];,.:=+-*/%!<>&|^~?@#".includes(c)) {
      tokens.push({ type: "punct", value: c, line });
      i++;
      continue;
    }
    i++;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Import extraction from the token stream.
// ---------------------------------------------------------------------------

function scanModuleSpecifier(tokens, start, requireFrom) {
  let sawFrom = false;
  const limit = Math.min(tokens.length, start + 120);
  for (let j = start; j < limit; j++) {
    const tk = tokens[j];
    if (tk.type === "string") {
      return requireFrom && !sawFrom ? null : { value: tk.value, line: tk.line };
    }
    if (tk.type === "ident") {
      if (STATEMENT_STARTERS.has(tk.value)) return null;
      if (tk.value === "from") sawFrom = true;
      continue;
    }
    if (tk.type === "punct" && tk.value === ";") return null;
  }
  return null;
}

function extractImports(source) {
  const tokens = tokenize(source);
  const imports = [];
  const prevIsDot = (k) => {
    const p = tokens[k - 1];
    return !!p && p.type === "punct" && p.value === ".";
  };
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "ident") continue;
    const next = tokens[k + 1];
    if (t.value === "import" && !prevIsDot(k)) {
      if (next && next.type === "punct" && next.value === "(") {
        const s = tokens[k + 2];
        if (s && s.type === "string") {
          imports.push({ specifier: s.value, line: s.line, form: "dynamic-import" });
        }
        continue;
      }
      if (next && next.type === "punct" && next.value === ".") continue; // import.meta
      const found = scanModuleSpecifier(tokens, k + 1, false);
      if (found) imports.push({ specifier: found.value, line: found.line, form: "import" });
      continue;
    }
    if (t.value === "export") {
      const found = scanModuleSpecifier(tokens, k + 1, true);
      if (found) imports.push({ specifier: found.value, line: found.line, form: "export-from" });
      continue;
    }
    if (t.value === "require" && !prevIsDot(k)) {
      if (next && next.type === "punct" && next.value === "(") {
        const s = tokens[k + 2];
        if (s && s.type === "string") {
          imports.push({ specifier: s.value, line: s.line, form: "require" });
        }
      }
      continue;
    }
  }
  return imports;
}

// ---------------------------------------------------------------------------
// Rules engine.
// ---------------------------------------------------------------------------

function packageRoot(specifier) {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

function toPosix(p) {
  return p.split("\\").join("/");
}

function classifyFile(virtualPath, rules) {
  const p = toPosix(virtualPath);
  const adaptersRoot = `${rules.adaptersRoot}/`;
  const portSegment = `/${rules.portPathSegment}/`;
  return {
    path: p,
    domainPackage: p.startsWith("packages/mos-"),
    substratePackage: p.startsWith("packages/zcode-substrate-adapters"),
    inAdaptersRoot: p.startsWith(adaptersRoot),
    isPortFile: p.includes(portSegment),
  };
}

function applyRules(file, imports, rules) {
  const violations = [];
  for (const imp of imports) {
    const spec = imp.specifier;
    const root = packageRoot(spec);
    if (file.domainPackage) {
      const allowed = rules.domainPrefixes.some((pre) => spec.startsWith(pre))
        || (rules.allowBareBuiltins && isBuiltin(root));
      if (!allowed) {
        violations.push({
          rule: "MOS-DOMAIN-IMPORT-BOUNDARY",
          kind: spec.startsWith("@zcode/") ? "zcode-import" : "disallowed-import",
          specifier: spec,
          file: file.path,
          line: imp.line,
        });
      }
    }
    if (spec.startsWith("@zcode/")) {
      if (!file.inAdaptersRoot) {
        violations.push({
          rule: "ZCODE-ADAPTER-ONLY-IMPORTS",
          kind: "outside-adapter-root",
          specifier: spec,
          file: file.path,
          line: imp.line,
        });
      } else if (!rules.entryAllowlist.includes(spec)) {
        violations.push({
          rule: "ZCODE-ADAPTER-ONLY-IMPORTS",
          kind: "non-allowlisted-entry",
          specifier: spec,
          file: file.path,
          line: imp.line,
        });
      }
    }
    for (const entry of rules.denylist) {
      const hit = root === entry || (entry.startsWith("@") && root.startsWith(`${entry}/`));
      if (hit) {
        violations.push({
          rule: "MOS-NO-ENGINE-SDK",
          kind: "engine-provider-sdk",
          specifier: spec,
          file: file.path,
          line: imp.line,
        });
        break;
      }
    }
    if (file.isPortFile && spec.startsWith("@zcode/")) {
      violations.push({
        rule: "PORTS-NO-ZCODE",
        kind: "port-file-zcode-import",
        specifier: spec,
        file: file.path,
        line: imp.line,
      });
    }
  }
  return violations;
}

function checkSource(virtualPath, source, rules) {
  return applyRules(classifyFile(virtualPath, rules), extractImports(source), rules);
}

// ---------------------------------------------------------------------------
// Drivers.
// ---------------------------------------------------------------------------

function loadRules() {
  const raw = JSON.parse(readFileSync(RULES_PATH, "utf8"));
  const domainRule = raw.rules.find((r) => r.id === "MOS-DOMAIN-IMPORT-BOUNDARY");
  const zcodeRule = raw.rules.find((r) => r.id === "ZCODE-ADAPTER-ONLY-IMPORTS");
  const sdkRule = raw.rules.find((r) => r.id === "MOS-NO-ENGINE-SDK");
  const portsRule = raw.rules.find((r) => r.id === "PORTS-NO-ZCODE");
  return {
    version: raw.version,
    scan: raw.managedScan,
    domainPrefixes: domainRule.allowedImportPrefixes,
    allowBareBuiltins: domainRule.allowBareNodeBuiltins,
    entryAllowlist: zcodeRule.zcodeEntryAllowlist,
    adaptersRoot: zcodeRule.zcodeImportAllowedOnlyUnder,
    portPathSegment: portsRule.portPathSegment,
    denylist: sdkRule.denylist,
    ruleIds: raw.rules.map((r) => r.id),
  };
}

function walk(dir, out, scan) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (scan.excludedPathSegments.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out, scan);
    } else if (entry.isFile() && scan.sourceExtensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(toPosix(full));
    }
  }
}

function scanRealTree(rules) {
  const packagesDir = join(repoRoot, "packages");
  const domainPackages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("mos-"))
    .map((e) => e.name);
  const roots = domainPackages.map((name) => join(packagesDir, name));
  roots.push(join(packagesDir, "zcode-substrate-adapters"));
  const files = [];
  for (const root of roots) walk(root, files, rules.scan);
  const violations = [];
  for (const file of files) {
    const rel = toPosix(file.slice(repoRoot.length + 1));
    const source = readFileSync(file, "utf8");
    violations.push(...checkSource(rel, source, rules));
  }
  return { files, domainPackages, violations };
}

function runSelfTest(rules) {
  const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, "manifest.json"), "utf8"));
  let failures = 0;
  for (const fixture of manifest.fixtures) {
    const source = readFileSync(join(FIXTURES_DIR, fixture.file), "utf8");
    const actual = checkSource(fixture.virtualPath, source, rules)
      .map((v) => `${v.rule}|${v.kind}|${v.specifier}`)
      .sort();
    const expected = (fixture.expectViolations ?? [])
      .map((v) => `${v.rule}|${v.kind}|${v.specifier}`)
      .sort();
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${fixture.file}`);
    console.log(`      virtual: ${fixture.virtualPath}`);
    console.log(`      expected: ${expected.length} violation(s)${expected.length ? `\n        ${expected.join("\n        ")}` : ""}`);
    console.log(`      detected: ${actual.length} violation(s)${actual.length ? `\n        ${actual.join("\n        ")}` : ""}`);
  }
  console.log("");
  if (failures > 0) {
    console.error(`SELF-TEST FAILED: ${failures} fixture(s) did not match expectations.`);
    process.exitCode = 1;
    return;
  }
  console.log(`SELF-TEST PASSED: all ${manifest.fixtures.length} fixtures matched.`);
}

function printReport(rules, result) {
  console.log("MOS substrate boundary check (W0-B / BOOT-003)");
  console.log(`rules: ${RULES_PATH} (v${rules.version})`);
  console.log(
    `scanned: ${result.files.length} source file(s); mos-* domain packages: ` +
      `${result.domainPackages.length}${result.domainPackages.length ? ` (${result.domainPackages.join(", ")})` : " — none present yet (dynamic discovery)"}`,
  );
  for (const ruleId of rules.ruleIds) {
    const hits = result.violations.filter((v) => v.rule === ruleId);
    console.log(`rule ${ruleId}: ${hits.length === 0 ? "OK" : `${hits.length} violation(s)`}`);
    for (const v of hits) {
      console.log(`  ${v.file}:${v.line}  [${v.kind}]  "${v.specifier}"`);
    }
  }
  const total = result.violations.length;
  console.log("");
  if (total > 0) {
    console.error(`BOUNDARY CHECK FAILED: ${total} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log("BOUNDARY CHECK PASSED: no violations.");
  }
}

const rules = loadRules();
if (selfTest) {
  runSelfTest(rules);
} else {
  printReport(rules, scanRealTree(rules));
}

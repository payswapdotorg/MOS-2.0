/**
 * TENANT-ID GRAMMAR PINS (W11-B) — runtime cross-check for the grammar pair
 * exported per docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md.
 *
 * Asserts that:
 *  (a) the exported pattern source is EXACTLY the proposed ACR grammar
 *      (a drifted constant fails here before any consumer can follow it),
 *  (b) the frozen grammar constant is frozen and self-consistent
 *      (pattern source, length bounds, ACR anchor),
 *  (c) isValidTenantId accepts the valid boundary shapes (1 char, 64 chars,
 *      digits, hyphens inside),
 *  (d) isValidTenantId rejects EVERY W9-B D1/D2 attack shape plus the
 *      confusion class the grammar also collapses (uppercase, unicode,
 *      underscore, whitespace, over-length, leading hyphen) — and is total
 *      (never throws on hostile input).
 *
 * The enforcement-point battery (createTenant fails closed; grandfathering)
 * lives in @mos/identity — this file pins the shared rule itself.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TENANT_ID_GRAMMAR,
  TENANT_ID_GRAMMAR_PATTERN_SOURCE,
  isValidTenantId,
} from "./tenant-id-grammar.js";

test("the exported tenant-id grammar pattern source is exactly the ACR-proposed grammar", () => {
  assert.equal(TENANT_ID_GRAMMAR_PATTERN_SOURCE, "^[a-z0-9][a-z0-9-]{0,63}$");
});

test("TENANT_ID_GRAMMAR is a frozen, self-consistent machine-readable constant", () => {
  assert.equal(Object.isFrozen(TENANT_ID_GRAMMAR), true);
  assert.equal(TENANT_ID_GRAMMAR.patternSource, TENANT_ID_GRAMMAR_PATTERN_SOURCE);
  assert.equal(TENANT_ID_GRAMMAR.minLength, 1);
  assert.equal(TENANT_ID_GRAMMAR.maxLength, 64);
  assert.equal(
    TENANT_ID_GRAMMAR.acr,
    "docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md",
  );
  assert.match(TENANT_ID_GRAMMAR.description, /lowercase/i);
});

test("isValidTenantId accepts the valid boundary shapes", () => {
  const valid = [
    "a", // shortest
    "0", // shortest, digit-first
    "tenant-a",
    "t1",
    "a1b2c3",
    "lab-018-tenant",
    "0123456789".repeat(7).slice(0, 64), // exactly 64 chars, digit-led
    "a".repeat(64), // exactly 64 chars, single letter
    "tenant-with-hyphens-everywhere-ok",
    "9lives",
  ];
  for (const id of valid) {
    assert.equal(isValidTenantId(id), true, `expected valid: ${JSON.stringify(id)}`);
  }
});

test("isValidTenantId rejects every D1/D2 attack shape (delimiter-laden ids)", () => {
  const hostile = [
    "tenant:a", // ':' — engines/jobs composite-key delimiter
    "a::b", // '::' — engines assignment-lane key delimiter
    "a|b", // '|' — distribution replay-ledger delimiter
    "a\u0000b", // NUL — lab/integrations/production composite-key delimiter
    "tenant-a\u0000x", // the exact W9-B hostile-id-factory shape
    "\u0000tenant", // leading NUL
    "", // empty — every composite key degenerates
  ];
  for (const id of hostile) {
    assert.equal(isValidTenantId(id), false, `expected rejected: ${JSON.stringify(id)}`);
  }
});

test("isValidTenantId rejects the confusion class (whitespace, case, unicode, underscore, length, leading hyphen)", () => {
  const hostile = [
    " ", // whitespace only
    "a b", // inner space
    "a\tb", // tab
    " tenant-a", // leading space
    "tenant-a ", // trailing space
    "A", // uppercase
    "Tenant-A", // mixed case
    "TENANT-A", // full uppercase
    "ténant", // latin-1 diacritic
    "租户", // CJK
    "tenant🙂", // astral-plane emoji
    "tenant_demo", // underscore (the migrated mos-web demo shape)
    "_tenant", // leading underscore
    "a".repeat(65), // over-length
    "-a", // leading hyphen
  ];
  for (const id of hostile) {
    assert.equal(isValidTenantId(id), false, `expected rejected: ${JSON.stringify(id)}`);
  }
});

test("isValidTenantId is total: hostile shapes never throw and the predicate is pure", () => {
  // Totality: even pathological inputs answer a boolean, never throw.
  const pathological = ["\u0000", "\u0000\u0000\u0000", "::|", "a".repeat(1000), "\uD800"];
  for (const id of pathological) {
    let verdict: boolean;
    try {
      verdict = isValidTenantId(id);
    } catch (thrown) {
      assert.fail(`isValidTenantId threw on ${JSON.stringify(id)}: ${String(thrown)}`);
    }
    assert.equal(typeof verdict, "boolean");
    assert.equal(verdict, false, `expected rejected: ${JSON.stringify(id)}`);
  }
  // Purity: the input is never mutated (trivial for strings, pinned anyway).
  const input = "tenant-a";
  isValidTenantId(input);
  assert.equal(input, "tenant-a");
});

test("the grammar is anchored (no partial-match acceptance of delimiter-laden suffixes)", () => {
  // A drifting un-anchored pattern would accept "tenant-a:evil" via a prefix
  // match. The exported source pins both anchors; these probe the behavior.
  assert.equal(isValidTenantId("tenant-a:evil"), false);
  assert.equal(isValidTenantId("evil:tenant-a"), false);
  assert.equal(isValidTenantId("tenant-a\n"), false);
  assert.equal(isValidTenantId("\ntenant-a"), false);
});

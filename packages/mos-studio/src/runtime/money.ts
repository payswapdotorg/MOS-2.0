/**
 * Shared decimal-string money arithmetic and validation for studio flows
 * (W9-C; STUDIO-013 extends with the finite-number guard).
 *
 * `MoneyAmount` amounts are decimal strings; float arithmetic would drift.
 * Extracted from the reaction flow so the reaction and video-podcast flows
 * sum processing + editing costs through ONE implementation (no drift
 * between formats), and so the packaging authority (STUDIO-013) and the
 * processing-output intake apply the SAME W9-B D5 finite-number discipline:
 * NaN/Infinity/negative/unparseable amounts fail closed, never silently sum.
 */

import type { MoneyAmount } from "../contracts/refs.js";

/** Sum two same-currency amounts (decimal-string minor-unit arithmetic). */
export function sumStudioMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  const currency = a.currency ?? b.currency;
  const scale = Math.max(a.amount.split(".")[1]?.length ?? 0, b.amount.split(".")[1]?.length ?? 0, 2);
  const toUnits = (value: string): bigint => {
    const [whole = "0", frac = ""] = value.split(".");
    return BigInt(`${whole}${frac.padEnd(scale, "0")}` || "0");
  };
  const total = toUnits(a.amount) + toUnits(b.amount);
  const divisor = 10n ** BigInt(scale);
  return { currency, amount: `${(total / divisor).toString()}.${(total % divisor).toString().padStart(scale, "0")}` };
}

/**
 * Enumerated issues of one money amount under the W9-B D5 guard (STUDIO-013):
 * the amount must parse as a finite, non-negative decimal string and the
 * currency must be a non-blank string. Empty when valid.
 */
export function studioMoneyIssues(amount: MoneyAmount): readonly string[] {
  const issues: string[] = [];
  if (typeof amount.currency !== "string" || amount.currency.trim().length === 0) {
    issues.push("currency must be a non-blank string");
  }
  if (typeof amount.amount !== "string" || !/^\d+(\.\d+)?$/.test(amount.amount.trim())) {
    issues.push(
      `amount "${String(amount.amount)}" must be a non-negative finite decimal string (NaN/Infinity/negative are rejected)`,
    );
  }
  return issues;
}

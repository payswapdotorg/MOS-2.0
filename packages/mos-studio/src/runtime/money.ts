/**
 * Shared decimal-string money arithmetic for studio flows (W9-C).
 *
 * `MoneyAmount` amounts are decimal strings; float arithmetic would drift.
 * Extracted from the reaction flow so the reaction and video-podcast flows
 * sum processing + editing costs through ONE implementation (no drift
 * between formats).
 *
 * W10-B money-integrity hardening (the W9-C dropped-cost defect class):
 * declared processing costs and engine costs are CALLER-influenced inputs,
 * so every amount is VALIDATED fail-closed before it can enter a sum or the
 * session's cost lines — a negative, signed, exponential, multi-dot or
 * NaN-shaped amount string is a typed failure at the flow/runtime intake,
 * never a silently-summed (or BigInt-crashing) value; currency confusion
 * fails closed too (costs never sum across currencies).
 */

import type { MoneyAmount } from "../contracts/refs.js";

/** Non-negative plain decimal string (no sign, no exponent, exactly one dot). */
const MONEY_AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

/**
 * Fail-closed validation of one studio `MoneyAmount` (W10-B). Returns the
 * violation reason, or `null` when the value is a well-formed non-negative
 * decimal amount with a non-blank currency. Consumed by the format flows
 * (the declared processing cost) and the runtime's processing-output intake
 * (the `additionalCost` line) — never by `sumStudioMoney` alone.
 */
export function validateStudioMoneyAmount(value: unknown): string | null {
  if (value === null || typeof value !== "object") {
    return "money amount must be an object { currency, amount }";
  }
  const candidate = value as { readonly currency?: unknown; readonly amount?: unknown };
  if (typeof candidate.currency !== "string" || candidate.currency.trim().length === 0) {
    return "money currency must be a non-blank string (e.g. \"USD\")";
  }
  if (typeof candidate.amount !== "string" || !MONEY_AMOUNT_PATTERN.test(candidate.amount)) {
    return 'money amount must be a non-negative plain decimal string (e.g. "12.34") — negative, signed, exponential, multi-dot or NaN-shaped values fail closed';
  }
  return null;
}

/** Named invalid-money error (defense in depth — the intakes pre-validate). */
export class InvalidStudioMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStudioMoneyError";
  }
}

/** Sum two same-currency amounts (decimal-string minor-unit arithmetic). */
export function sumStudioMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  // W10-B defense in depth: the flows validate the declared processing cost
  // and match currencies BEFORE summing, so these guards are unreachable on
  // the flow paths — but a future caller summing unvalidated money gets a
  // NAMED failure here instead of a silent mis-sum or a deep BigInt crash.
  const aFault = validateStudioMoneyAmount(a);
  if (aFault !== null) {
    throw new InvalidStudioMoneyError(`first amount: ${aFault}`);
  }
  const bFault = validateStudioMoneyAmount(b);
  if (bFault !== null) {
    throw new InvalidStudioMoneyError(`second amount: ${bFault}`);
  }
  if (a.currency !== b.currency) {
    throw new InvalidStudioMoneyError(
      `currency mismatch: "${a.currency}" vs "${b.currency}" — costs never sum across currencies`,
    );
  }
  const currency = a.currency;
  const scale = Math.max(a.amount.split(".")[1]?.length ?? 0, b.amount.split(".")[1]?.length ?? 0, 2);
  const toUnits = (value: string): bigint => {
    const [whole = "0", frac = ""] = value.split(".");
    return BigInt(`${whole}${frac.padEnd(scale, "0")}` || "0");
  };
  const total = toUnits(a.amount) + toUnits(b.amount);
  const divisor = 10n ** BigInt(scale);
  return { currency, amount: `${(total / divisor).toString()}.${(total % divisor).toString().padStart(scale, "0")}` };
}

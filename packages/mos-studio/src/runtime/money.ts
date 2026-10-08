/**
 * Shared decimal-string money arithmetic for studio flows (W9-C).
 *
 * `MoneyAmount` amounts are decimal strings; float arithmetic would drift.
 * Extracted from the reaction flow so the reaction and video-podcast flows
 * sum processing + editing costs through ONE implementation (no drift
 * between formats).
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

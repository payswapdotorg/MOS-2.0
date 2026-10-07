/**
 * VIOLATION fixture (rule a): non-allowed imports inside a MOS domain
 * package — a bare third-party package and an absolute path. Neither is
 * @zcode (that is covered by another fixture) and neither is in the engine
 * denylist (covered by other fixtures): this isolates the domain import
 * allowlist itself.
 */
import lodash from "lodash";
import { helper } from "/absolute/path/module.js";

export const combined = { lodash, helper };

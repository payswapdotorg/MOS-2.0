/**
 * VIOLATION fixture (rule b): @zcode import in the substrate-adapters
 * package but OUTSIDE the src/adapters root (here: the package index).
 * Even an allowlisted entry name is illegal outside the adapter root.
 */
import { helper } from "@zcode/shared";

export const surface = { helper };

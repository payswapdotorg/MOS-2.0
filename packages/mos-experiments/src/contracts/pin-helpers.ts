/**
 * Shared compile-time pin helpers (the @mos/contracts / mos-lab
 * type-assertion technique, verbatim — one import site per file).
 */

/** Compile-time assertion helper. */
export type Expect<T extends true> = T;

/** Strict type equality. */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** `true` only when `Source` is assignable to `Target`. */
export type IsAssignable<Source, Target> = Source extends Target ? true : false;

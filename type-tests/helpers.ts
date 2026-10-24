/** True when A and B are identical types (not merely mutually assignable). */
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Compile-time assertion: `assertType<Equal<A, B>>()` fails to compile unless the argument is `true`. */
export function assertType<T extends true>(): T | void {}

/** Mutual assignability, for types TypeScript displays identically but stores differently (enums). */
export type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

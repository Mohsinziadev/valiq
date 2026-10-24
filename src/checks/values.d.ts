/**
 * JSON-semantics deep equality: arrays by position, plain objects by own keys regardless of order,
 * numbers by value (`0` equals `-0`). Values nested deeper than 1000 levels (or cyclic) compare as
 * unequal instead of overflowing the stack.
 */
export declare function deepEqual(a: unknown, b: unknown, depth?: number): boolean;
/**
 * Finds the first pair of deeply-equal items in linear time: primitives are bucketed by value and
 * plain objects/arrays by a canonical key. Anything else falls back to pairwise `deepEqual`.
 */
export declare function findDuplicate(items: readonly unknown[]): [number, number] | undefined;
/**
 * `value` is an integer multiple of `divisor`. Decimal divisors are compared after scaling both
 * numbers to integers, so `0.3` is a multiple of `0.1` despite binary floating point.
 */
export declare function isMultipleOf(value: number, divisor: number): boolean;
/** Length in Unicode code points, so an emoji counts as one character. */
export declare function codePointLength(value: string): number;
/** `codePointLength(value) >= min`, skipping the count when the UTF-16 length decides it. */
export declare function hasMinLength(value: string, min: number): boolean;
/** `codePointLength(value) <= max`, skipping the count when the UTF-16 length decides it. */
export declare function hasMaxLength(value: string, max: number): boolean;
/** Copies a RegExp without the stateful `g` and `y` flags, so `test()` never depends on `lastIndex`. */
export declare function statelessRegExp(re: RegExp): RegExp;

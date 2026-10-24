const MAX_COMPARE_DEPTH = 1000;

/**
 * JSON-semantics deep equality: arrays by position, plain objects by own keys regardless of order,
 * numbers by value (`0` equals `-0`). Values nested deeper than 1000 levels (or cyclic) compare as
 * unequal instead of overflowing the stack.
 */
export function deepEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (depth > MAX_COMPARE_DEPTH) return false;
  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;
  if (aArray) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i], depth + 1)) return false;
    return true;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1)) return false;
  }
  return true;
}

/** A canonical string for a JSON-like value (object keys sorted), or `undefined` if it has none. */
function canonical(value: unknown, depth: number): string | undefined {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return Object.is(value, -0) ? '0' : String(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'undefined':
      return 'undefined';
    case 'object': {
      if (depth > MAX_COMPARE_DEPTH) return undefined;
      const parts: string[] = [];
      if (Array.isArray(value)) {
        for (const item of value) {
          const part = canonical(item, depth + 1);
          if (part === undefined) return undefined;
          parts.push(part);
        }
        return `[${parts.join(',')}]`;
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return undefined;
      for (const key of Object.keys(value).sort()) {
        const part = canonical((value as Record<string, unknown>)[key], depth + 1);
        if (part === undefined) return undefined;
        parts.push(`${JSON.stringify(key)}:${part}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      return undefined;
  }
}

/**
 * Finds the first pair of deeply-equal items in linear time: primitives are bucketed by value and
 * plain objects/arrays by a canonical key. Anything else falls back to pairwise `deepEqual`.
 */
export function findDuplicate(items: readonly unknown[]): [number, number] | undefined {
  const seen = new Map<unknown, number>();
  const shapes = new Map<string, number>();
  const others: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === 'object' && item !== null) {
      const key = canonical(item, 0);
      if (key === undefined) {
        for (const j of others) if (deepEqual(items[j], item)) return [j, i];
        others.push(i);
      } else {
        const previous = shapes.get(key);
        if (previous !== undefined) return [previous, i];
        shapes.set(key, i);
      }
      continue;
    }
    // Map keys use SameValueZero, which already treats 0 and -0 as equal.
    const previous = seen.get(item);
    if (previous !== undefined) return [previous, i];
    seen.set(item, i);
  }
  return undefined;
}

/**
 * `value` is an integer multiple of `divisor`. Decimal divisors are compared after scaling both
 * numbers to integers, so `0.3` is a multiple of `0.1` despite binary floating point.
 */
export function isMultipleOf(value: number, divisor: number): boolean {
  if (Number.isInteger(value) && Number.isInteger(divisor)) return value % divisor === 0;
  const places = Math.max(decimals(value), decimals(divisor));
  if (places <= 15) {
    const scale = 10 ** places;
    const a = Math.round(value * scale);
    const b = Math.round(divisor * scale);
    if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && b !== 0) return a % b === 0;
  }
  const quotient = value / divisor;
  return Number.isFinite(quotient) && Number.isInteger(quotient);
}

function decimals(n: number): number {
  if (Number.isInteger(n)) return 0;
  const text = String(n);
  const e = text.indexOf('e-');
  if (e !== -1) {
    const mantissa = text.slice(0, e);
    const dot = mantissa.indexOf('.');
    return Number(text.slice(e + 2)) + (dot === -1 ? 0 : mantissa.length - dot - 1);
  }
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Length in Unicode code points, so an emoji counts as one character. */
export function codePointLength(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length) {
      const d = value.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

/** `codePointLength(value) >= min`, skipping the count when the UTF-16 length decides it. */
export function hasMinLength(value: string, min: number): boolean {
  if (value.length < min) return false;
  if (Math.ceil(value.length / 2) >= min) return true;
  return codePointLength(value) >= min;
}

/** `codePointLength(value) <= max`, skipping the count when the UTF-16 length decides it. */
export function hasMaxLength(value: string, max: number): boolean {
  if (value.length <= max) return true;
  if (Math.ceil(value.length / 2) > max) return false;
  return codePointLength(value) <= max;
}

/** Copies a RegExp without the stateful `g` and `y` flags, so `test()` never depends on `lastIndex`. */
export function statelessRegExp(re: RegExp): RegExp {
  return re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, '')) : re;
}

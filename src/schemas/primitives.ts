import { FAIL, report, typeName, type Ctx } from '../core/context.ts';
import type { IssueData, MessageSpec } from '../core/issues.ts';
import { fromRun, Schema, type Compiled } from '../core/schema.ts';
import {
  isDate,
  isEmail,
  isHostname,
  isIPv4,
  isIPv6,
  isLocalDateTime,
  isLocalTime,
  isRFC3339DateTime,
  isURL,
  isUUID,
} from '../checks/formats.ts';
import { hasMaxLength, hasMinLength, isMultipleOf, statelessRegExp } from '../checks/values.ts';

/** Options accepted by schema factories, e.g. `v.string({ message: 'Name must be text' })`. */
export interface TypeOptions {
  /** Message for the type check (`invalid_type`). */
  message?: MessageSpec;
}

/** Per-check options: a message string or an object with `message`. */
export type CheckOptions = string | { message?: MessageSpec };

function messageOf(options: CheckOptions | undefined): MessageSpec | undefined {
  return typeof options === 'string' ? options : options?.message;
}

/** A single constraint, kept as data so it can be exported to JSON Schema. */
export interface Check<T> {
  readonly name: string;
  readonly test?: ((value: T) => boolean) | undefined;
  /** Transforms the value instead of testing it (e.g. `trim`). */
  readonly map?: ((value: T) => T) | undefined;
  readonly issue?: IssueData | undefined;
  readonly message?: MessageSpec | undefined;
  /** Data for JSON Schema export. */
  readonly value?: unknown;
  /** Skip the remaining checks when this one fails (length limits guard costlier checks). */
  readonly stop?: boolean | undefined;
}

function runChecks<T>(checks: readonly Check<T>[], value: T, ctx: Ctx): T | typeof FAIL {
  let current = value;
  let ok = true;
  for (const check of checks) {
    if (check.map !== undefined) {
      current = check.map(current);
    } else if (!check.test!(current)) {
      report(ctx, check.issue!, check.message);
      ok = false;
      if (ctx.abort || check.stop === true) return FAIL;
    }
  }
  return ok ? current : FAIL;
}

/** Builds a `Compiled` for a primitive type: a type guard followed by ordered checks. */
function primitive<T>(
  guard: (value: unknown) => value is T,
  expected: string,
  checks: readonly Check<T>[],
  typeMessage: MessageSpec | undefined,
  coerce?: (value: unknown) => unknown,
): Compiled {
  const pure = coerce === undefined && checks.every((check) => check.map === undefined);
  const tests = checks.map((check) => check.test).filter((test) => test !== undefined);
  const invalid = (value: unknown, ctx: Ctx) => {
    report(ctx, { code: 'invalid_type', expected, received: typeName(value) }, typeMessage);
    return FAIL;
  };
  const run = (input: unknown, ctx: Ctx): unknown => {
    const value = coerce === undefined ? input : coerce(input);
    if (!guard(value)) return invalid(input, ctx);
    return checks.length === 0 ? value : runChecks(checks, value, ctx);
  };
  if (!pure) return fromRun(run);
  const is =
    tests.length === 0
      ? guard
      : (value: unknown): boolean => {
          if (!guard(value)) return false;
          for (const test of tests) if (!test(value)) return false;
          return true;
        };
  return { run, is, pure: true };
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

abstract class CheckedSchema<T> extends Schema<T> {
  /** @internal */
  readonly _checks: readonly Check<T>[] = [];
  /** @internal */
  _typeMessage: MessageSpec | undefined;
  /** @internal */
  _coerce = false;

  constructor(options?: TypeOptions) {
    super();
    this._typeMessage = options?.message;
  }

  /** @internal */
  protected _check(check: Check<T>): this {
    return this._with({ _checks: [...this._checks, check] });
  }
}

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export interface UrlOptions {
  /** Allowed schemes without the colon. Default `['http', 'https']`. */
  protocols?: string[];
  message?: MessageSpec;
}

export interface DateTimeOptions {
  /** Accept local date-times without seconds or offset (`<input type="datetime-local">`). */
  local?: boolean;
  message?: MessageSpec;
}

export class StringSchema extends CheckedSchema<string> {
  readonly kind = 'string';

  /** @internal */
  protected _build(): Compiled {
    return primitive(isString, 'string', this._checks, this._typeMessage);
  }

  private _len(name: 'min' | 'max' | 'length', n: number, options: CheckOptions | undefined): this {
    if (!Number.isInteger(n) || n < 0) throw new TypeError(`string().${name}() expects a non-negative integer`);
    const message = messageOf(options);
    if (name === 'min') {
      return this._check({
        name,
        value: n,
        test: (s) => hasMinLength(s, n),
        issue: { code: 'too_small', origin: 'string', minimum: n, inclusive: true },
        message,
      });
    }
    if (name === 'max') {
      return this._check({
        name,
        value: n,
        test: (s) => hasMaxLength(s, n),
        issue: { code: 'too_big', origin: 'string', maximum: n, inclusive: true },
        message,
        stop: true,
      });
    }
    return this._with({
      _checks: [
        ...this._checks,
        {
          name: 'min',
          value: n,
          test: (s: string) => hasMinLength(s, n),
          issue: { code: 'too_small', origin: 'string', minimum: n, inclusive: true, exact: true },
          message,
        },
        {
          name: 'max',
          value: n,
          test: (s: string) => hasMaxLength(s, n),
          issue: { code: 'too_big', origin: 'string', maximum: n, inclusive: true, exact: true },
          message,
          stop: true,
        },
      ],
    });
  }

  /** At least `n` characters (Unicode code points). */
  min(n: number, options?: CheckOptions): this {
    return this._len('min', n, options);
  }

  /** At most `n` characters (Unicode code points). */
  max(n: number, options?: CheckOptions): this {
    return this._len('max', n, options);
  }

  /** Exactly `n` characters (Unicode code points). */
  length(n: number, options?: CheckOptions): this {
    return this._len('length', n, options);
  }

  /** Matches `pattern`. The `g` and `y` flags are dropped so results never depend on `lastIndex`. */
  regex(pattern: RegExp, options?: CheckOptions): this {
    const re = statelessRegExp(pattern);
    return this._check({
      name: 'regex',
      value: re,
      test: (s) => re.test(s),
      issue: { code: 'invalid_pattern', pattern: re.source },
      message: messageOf(options),
    });
  }

  private _format(format: string, test: (s: string) => boolean, options: CheckOptions | undefined): this {
    return this._check({
      name: 'format',
      value: format,
      test,
      issue: { code: 'invalid_format', format },
      message: messageOf(options),
    });
  }

  /** A practical email address; see the docs for the exact rules. */
  email(options?: CheckOptions): this {
    return this._format('email', isEmail, options);
  }

  /** An absolute web URL. Only `http` and `https` are accepted unless `protocols` says otherwise. */
  url(options?: UrlOptions): this {
    const protocols = options?.protocols?.map((p) => p.replace(/:$/, '').toLowerCase());
    return this._check({
      name: 'format',
      value: 'url',
      test: (s) => isURL(s, protocols),
      issue: { code: 'invalid_format', format: 'url' },
      message: options?.message,
    });
  }

  /** A UUID in its 36-character textual form, any version. */
  uuid(options?: CheckOptions): this {
    return this._format('uuid', isUUID, options);
  }

  ipv4(options?: CheckOptions): this {
    return this._format('ipv4', isIPv4, options);
  }

  ipv6(options?: CheckOptions): this {
    return this._format('ipv6', isIPv6, options);
  }

  hostname(options?: CheckOptions): this {
    return this._format('hostname', isHostname, options);
  }

  /** A calendar date `YYYY-MM-DD`. */
  isoDate(options?: CheckOptions): this {
    return this._format('date', isDate, options);
  }

  /** A local time `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff` (no offset). */
  isoTime(options?: CheckOptions): this {
    return this._format('time', isLocalTime, options);
  }

  /**
   * An RFC 3339 date-time with offset, e.g. `2024-05-01T12:00:00Z`. With `{ local: true }`, a local
   * date-time without offset (seconds optional) is accepted instead.
   */
  isoDateTime(options?: DateTimeOptions): this {
    const local = options?.local === true;
    return this._check({
      name: 'format',
      value: local ? 'local-date-time' : 'date-time',
      test: local ? isLocalDateTime : isRFC3339DateTime,
      issue: { code: 'invalid_format', format: 'date-time' },
      message: options?.message,
    });
  }

  startsWith(prefix: string, options?: CheckOptions): this {
    return this._check({
      name: 'startsWith',
      value: prefix,
      test: (s) => s.startsWith(prefix),
      issue: { code: 'invalid_format', format: `starts with ${JSON.stringify(prefix)}` },
      message: messageOf(options),
    });
  }

  endsWith(suffix: string, options?: CheckOptions): this {
    return this._check({
      name: 'endsWith',
      value: suffix,
      test: (s) => s.endsWith(suffix),
      issue: { code: 'invalid_format', format: `ends with ${JSON.stringify(suffix)}` },
      message: messageOf(options),
    });
  }

  includes(part: string, options?: CheckOptions): this {
    return this._check({
      name: 'includes',
      value: part,
      test: (s) => s.includes(part),
      issue: { code: 'invalid_format', format: `includes ${JSON.stringify(part)}` },
      message: messageOf(options),
    });
  }

  /** Transform: removes surrounding whitespace. Checks added after it see the trimmed value. */
  trim(): this {
    return this._check({ name: 'trim', map: (s) => s.trim() });
  }

  /** Transform: lower-cases the value. */
  toLowerCase(): this {
    return this._check({ name: 'toLowerCase', map: (s) => s.toLowerCase() });
  }

  /** Transform: upper-cases the value. */
  toUpperCase(): this {
    return this._check({ name: 'toUpperCase', map: (s) => s.toUpperCase() });
  }
}

export class NumberSchema extends CheckedSchema<number> {
  readonly kind = 'number';

  /** @internal */
  protected _build(): Compiled {
    const coerce = this._coerce ? coerceNumber : undefined;
    const integer = this._checks.some((check) => check.name === 'int');
    return primitive(isNumber, integer ? 'integer' : 'number', this._checks, this._typeMessage, coerce);
  }

  private _bound(name: 'min' | 'max' | 'gt' | 'lt', n: number, options: CheckOptions | undefined): this {
    if (!Number.isFinite(n)) throw new TypeError(`number().${name}() expects a finite number`);
    const message = messageOf(options);
    switch (name) {
      case 'min':
        return this._check({
          name,
          value: n,
          message,
          test: (x) => x >= n,
          issue: { code: 'too_small', origin: 'number', minimum: n, inclusive: true },
        });
      case 'gt':
        return this._check({
          name,
          value: n,
          message,
          test: (x) => x > n,
          issue: { code: 'too_small', origin: 'number', minimum: n, inclusive: false },
        });
      case 'max':
        return this._check({
          name,
          value: n,
          message,
          test: (x) => x <= n,
          issue: { code: 'too_big', origin: 'number', maximum: n, inclusive: true },
        });
      case 'lt':
        return this._check({
          name,
          value: n,
          message,
          test: (x) => x < n,
          issue: { code: 'too_big', origin: 'number', maximum: n, inclusive: false },
        });
    }
  }

  /** `>= n` */
  min(n: number, options?: CheckOptions): this {
    return this._bound('min', n, options);
  }

  /** `<= n` */
  max(n: number, options?: CheckOptions): this {
    return this._bound('max', n, options);
  }

  /** `> n` */
  gt(n: number, options?: CheckOptions): this {
    return this._bound('gt', n, options);
  }

  /** `< n` */
  lt(n: number, options?: CheckOptions): this {
    return this._bound('lt', n, options);
  }

  /** A whole number. Large integers such as `1e21` count; add `.max()` to bound them. */
  int(options?: CheckOptions): this {
    return this._check({
      name: 'int',
      test: Number.isInteger,
      issue: { code: 'invalid_type', expected: 'integer', received: 'number' },
      message: messageOf(options),
    });
  }

  /** An integer multiple of `divisor`, tolerant of decimal divisors such as `0.01`. */
  multipleOf(divisor: number, options?: CheckOptions): this {
    if (!(divisor > 0) || !Number.isFinite(divisor)) throw new TypeError('multipleOf() expects a positive number');
    return this._check({
      name: 'multipleOf',
      value: divisor,
      test: (x) => isMultipleOf(x, divisor),
      issue: { code: 'not_multiple_of', divisor },
      message: messageOf(options),
    });
  }
}

function coerceNumber(value: unknown): unknown {
  if (typeof value === 'string') {
    const text = value.trim();
    return NUMERIC.test(text) ? Number(text) : value;
  }
  return value;
}

export class BooleanSchema extends CheckedSchema<boolean> {
  readonly kind = 'boolean';
  /** @internal */
  protected _build(): Compiled {
    return primitive(isBoolean, 'boolean', [], this._typeMessage, this._coerce ? coerceBoolean : undefined);
  }
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1') return true;
    if (text === 'false' || text === '0') return false;
  } else if (value === 1) {
    return true;
  } else if (value === 0) {
    return false;
  }
  return value;
}

export class DateSchema extends CheckedSchema<Date> {
  readonly kind = 'date';
  /** @internal */
  protected _build(): Compiled {
    return primitive(isValidDate, 'Date', this._checks, this._typeMessage, this._coerce ? coerceDate : undefined);
  }

  /** On or after `date`. */
  min(date: Date | number | string, options?: CheckOptions): this {
    const ms = new Date(date).getTime();
    if (Number.isNaN(ms)) throw new TypeError('date().min() expects a valid date');
    return this._check({
      name: 'min',
      value: ms,
      test: (d) => d.getTime() >= ms,
      issue: { code: 'too_small', origin: 'date', minimum: ms, inclusive: true },
      message: messageOf(options),
    });
  }

  /** On or before `date`. */
  max(date: Date | number | string, options?: CheckOptions): this {
    const ms = new Date(date).getTime();
    if (Number.isNaN(ms)) throw new TypeError('date().max() expects a valid date');
    return this._check({
      name: 'max',
      value: ms,
      test: (d) => d.getTime() <= ms,
      issue: { code: 'too_big', origin: 'date', maximum: ms, inclusive: true },
      message: messageOf(options),
    });
  }
}

function coerceDate(value: unknown): unknown {
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return value;
}

/** A schema accepting exactly one primitive value. */
export type Literal = string | number | boolean | null | undefined;

export class LiteralSchema<T extends Literal> extends Schema<T> {
  readonly kind = 'literal';
  constructor(
    readonly value: T,
    private readonly _message?: MessageSpec,
  ) {
    super();
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('literal() expects a finite number');
  }
  /** @internal */
  protected _build(): Compiled {
    const expected = this.value;
    const issue: IssueData = { code: 'invalid_value', values: [expected] };
    const message = this._message;
    return {
      run: (value, ctx) => {
        if (value === expected) return value;
        report(ctx, issue, message);
        return FAIL;
      },
      is: (value) => value === expected,
      pure: true,
    };
  }
}

/** Accepts one of a fixed set of primitive values. */
export class EnumSchema<T extends Literal> extends Schema<T> {
  readonly kind = 'enum';
  constructor(
    readonly options: readonly T[],
    private readonly _message?: MessageSpec,
  ) {
    super();
    if (options.length === 0) throw new TypeError('enum() expects at least one value');
  }
  /** @internal */
  protected _build(): Compiled {
    const set = new Set<unknown>(this.options);
    const issue: IssueData = { code: 'invalid_value', values: [...this.options] };
    const message = this._message;
    return {
      run: (value, ctx) => {
        if (set.has(value)) return value;
        report(ctx, issue, message);
        return FAIL;
      },
      is: (value) => set.has(value),
      pure: true,
    };
  }
  /** The allowed values, keyed by themselves: `Role.enum.admin === 'admin'`. */
  get enum(): { readonly [K in T & PropertyKey]: K } {
    const out: Record<PropertyKey, unknown> = {};
    for (const option of this.options)
      if (typeof option === 'string' || typeof option === 'number') out[option] = option;
    return out as { readonly [K in T & PropertyKey]: K };
  }
}

/** A schema for a value accepted by a type guard (`null`, `undefined`, `unknown`, `never`). */
export class TypeSchema<T> extends Schema<T> {
  constructor(
    readonly kind: 'null' | 'undefined' | 'unknown' | 'never',
    private readonly _guard: (value: unknown) => boolean,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }
  /** @internal */
  protected _build(): Compiled {
    const guard = this._guard;
    const expected = this.kind;
    const message = this._message;
    return {
      run: (value, ctx) => {
        if (guard(value)) return value;
        report(ctx, { code: 'invalid_type', expected, received: typeName(value) }, message);
        return FAIL;
      },
      is: guard,
      pure: true,
    };
  }
}

/** `value instanceof constructor`, e.g. `v.instance(File)`. */
export class InstanceSchema<T> extends Schema<T> {
  readonly kind = 'instance';
  constructor(
    readonly ctor: abstract new (...args: never[]) => T,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }
  /** @internal */
  protected _build(): Compiled {
    const ctor = this.ctor;
    const expected = ctor.name || 'instance';
    const message = this._message;
    return {
      run: (value, ctx) => {
        if (value instanceof ctor) return value;
        report(ctx, { code: 'invalid_type', expected, received: typeName(value) }, message);
        return FAIL;
      },
      is: (value) => value instanceof ctor,
      pure: true,
    };
  }
}

/** A schema defined by a predicate: `v.custom<Uint8Array>((x) => x instanceof Uint8Array)`. */
export class CustomSchema<T> extends Schema<T> {
  readonly kind = 'custom';
  constructor(
    private readonly _test: (value: unknown) => boolean,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }
  /** @internal */
  protected _build(): Compiled {
    const test = this._test;
    const message = this._message;
    return {
      run: (value, ctx) => {
        if (test(value)) return value;
        report(ctx, { code: 'custom' }, message);
        return FAIL;
      },
      is: (value) => test(value),
      pure: true,
    };
  }
}

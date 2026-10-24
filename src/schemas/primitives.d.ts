import type { IssueData, MessageSpec } from '../core/issues.ts';
import { Schema, type Compiled } from '../core/schema.ts';
/** Options accepted by schema factories, e.g. `v.string({ message: 'Name must be text' })`. */
export interface TypeOptions {
  /** Message for the type check (`invalid_type`). */
  message?: MessageSpec;
}
/** Per-check options: a message string or an object with `message`. */
export type CheckOptions =
  | string
  | {
      message?: MessageSpec;
    };
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
}
declare abstract class CheckedSchema<T> extends Schema<T> {
  /** @internal */
  readonly _checks: readonly Check<T>[];
  /** @internal */
  _typeMessage: MessageSpec | undefined;
  /** @internal */
  _coerce: boolean;
  constructor(options?: TypeOptions);
  /** @internal */
  protected _check(check: Check<T>): this;
}
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
export declare class StringSchema extends CheckedSchema<string> {
  readonly kind = 'string';
  /** @internal */
  protected _build(): Compiled;
  private _len;
  /** At least `n` characters (Unicode code points). */
  min(n: number, options?: CheckOptions): this;
  /** At most `n` characters (Unicode code points). */
  max(n: number, options?: CheckOptions): this;
  /** Exactly `n` characters (Unicode code points). */
  length(n: number, options?: CheckOptions): this;
  /** Matches `pattern`. The `g` and `y` flags are dropped so results never depend on `lastIndex`. */
  regex(pattern: RegExp, options?: CheckOptions): this;
  private _format;
  /** A practical email address; see the docs for the exact rules. */
  email(options?: CheckOptions): this;
  /** An absolute web URL. Only `http` and `https` are accepted unless `protocols` says otherwise. */
  url(options?: UrlOptions): this;
  /** A UUID in its 36-character textual form, any version. */
  uuid(options?: CheckOptions): this;
  ipv4(options?: CheckOptions): this;
  ipv6(options?: CheckOptions): this;
  hostname(options?: CheckOptions): this;
  /** A calendar date `YYYY-MM-DD`. */
  isoDate(options?: CheckOptions): this;
  /** A local time `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff` (no offset). */
  isoTime(options?: CheckOptions): this;
  /**
   * An RFC 3339 date-time with offset, e.g. `2024-05-01T12:00:00Z`. With `{ local: true }`, a local
   * date-time without offset (seconds optional) is accepted instead.
   */
  isoDateTime(options?: DateTimeOptions): this;
  startsWith(prefix: string, options?: CheckOptions): this;
  endsWith(suffix: string, options?: CheckOptions): this;
  includes(part: string, options?: CheckOptions): this;
  /** Transform: removes surrounding whitespace. Checks added after it see the trimmed value. */
  trim(): this;
  /** Transform: lower-cases the value. */
  toLowerCase(): this;
  /** Transform: upper-cases the value. */
  toUpperCase(): this;
}
export declare class NumberSchema extends CheckedSchema<number> {
  readonly kind = 'number';
  /** @internal */
  protected _build(): Compiled;
  private _bound;
  /** `>= n` */
  min(n: number, options?: CheckOptions): this;
  /** `<= n` */
  max(n: number, options?: CheckOptions): this;
  /** `> n` */
  gt(n: number, options?: CheckOptions): this;
  /** `< n` */
  lt(n: number, options?: CheckOptions): this;
  /** A whole number. Large integers such as `1e21` count; add `.max()` to bound them. */
  int(options?: CheckOptions): this;
  /** An integer multiple of `divisor`, tolerant of decimal divisors such as `0.01`. */
  multipleOf(divisor: number, options?: CheckOptions): this;
}
export declare class BooleanSchema extends CheckedSchema<boolean> {
  readonly kind = 'boolean';
  /** @internal */
  protected _build(): Compiled;
}
export declare class DateSchema extends CheckedSchema<Date> {
  readonly kind = 'date';
  /** @internal */
  protected _build(): Compiled;
  /** On or after `date`. */
  min(date: Date | number | string, options?: CheckOptions): this;
  /** On or before `date`. */
  max(date: Date | number | string, options?: CheckOptions): this;
}
/** A schema accepting exactly one primitive value. */
export type Literal = string | number | boolean | null | undefined;
export declare class LiteralSchema<T extends Literal> extends Schema<T> {
  readonly value: T;
  private readonly _message?;
  readonly kind = 'literal';
  constructor(value: T, _message?: MessageSpec | undefined);
  /** @internal */
  protected _build(): Compiled;
}
/** Accepts one of a fixed set of primitive values. */
export declare class EnumSchema<T extends Literal> extends Schema<T> {
  readonly options: readonly T[];
  private readonly _message?;
  readonly kind = 'enum';
  constructor(options: readonly T[], _message?: MessageSpec | undefined);
  /** @internal */
  protected _build(): Compiled;
  /** The allowed values, keyed by themselves: `Role.enum.admin === 'admin'`. */
  get enum(): {
    readonly [K in T & PropertyKey]: K;
  };
}
/** A schema for a value accepted by a type guard (`null`, `undefined`, `unknown`, `never`). */
export declare class TypeSchema<T> extends Schema<T> {
  readonly kind: 'null' | 'undefined' | 'unknown' | 'never';
  private readonly _guard;
  private readonly _message?;
  constructor(
    kind: 'null' | 'undefined' | 'unknown' | 'never',
    _guard: (value: unknown) => boolean,
    _message?: MessageSpec | undefined,
  );
  /** @internal */
  protected _build(): Compiled;
}
/** `value instanceof constructor`, e.g. `v.instance(File)`. */
export declare class InstanceSchema<T> extends Schema<T> {
  readonly ctor: abstract new (...args: never[]) => T;
  private readonly _message?;
  readonly kind = 'instance';
  constructor(ctor: abstract new (...args: never[]) => T, _message?: MessageSpec | undefined);
  /** @internal */
  protected _build(): Compiled;
}
/** A schema defined by a predicate: `v.custom<Uint8Array>((x) => x instanceof Uint8Array)`. */
export declare class CustomSchema<T> extends Schema<T> {
  private readonly _test;
  private readonly _message?;
  readonly kind = 'custom';
  constructor(_test: (value: unknown) => boolean, _message?: MessageSpec | undefined);
  /** @internal */
  protected _build(): Compiled;
}
export {};

import type { MessageSpec } from './core/issues.ts';
import type { AnySchema, Schema } from './core/schema.ts';
import { ArraySchema, TupleSchema } from './schemas/array.ts';
import { IntersectionSchema, LazySchema, RecordSchema, UnionSchema } from './schemas/composite.ts';
import { ObjectSchema, type Shape } from './schemas/object.ts';
import {
  BooleanSchema,
  CustomSchema,
  DateSchema,
  EnumSchema,
  InstanceSchema,
  LiteralSchema,
  NumberSchema,
  StringSchema,
  TypeSchema,
  type Literal,
  type TypeOptions,
} from './schemas/primitives.ts';
export type { Infer, Input, AnySchema } from './core/schema.ts';
export type { Shape } from './schemas/object.ts';
export type { Literal, TypeOptions } from './schemas/primitives.ts';
/** A string. Lengths are measured in Unicode code points. */
export declare function string(options?: TypeOptions): StringSchema;
/** A finite number (`NaN` and `±Infinity` are rejected). */
export declare function number(options?: TypeOptions): NumberSchema;
export declare function boolean(options?: TypeOptions): BooleanSchema;
/** A valid `Date` instance (invalid dates are rejected). */
export declare function date(options?: TypeOptions): DateSchema;
declare const nullSchema: (options?: TypeOptions) => TypeSchema<null>;
declare const undefinedSchema: (options?: TypeOptions) => TypeSchema<undefined>;
export { nullSchema as null, undefinedSchema as undefined };
/** Accepts anything. The result is typed `unknown`, so it must be narrowed before use. */
export declare function unknown(): TypeSchema<unknown>;
/** Accepts nothing. */
export declare function never(options?: TypeOptions): TypeSchema<never>;
/** Exactly `value` (compared with `===`). */
export declare function literal<const T extends Literal>(value: T, options?: TypeOptions): LiteralSchema<T>;
/** A TypeScript `enum` object: its values (numeric enums' reverse mappings are ignored). */
type EnumLike = {
  readonly [key: string]: string | number;
};
declare function enumSchema<const T extends readonly [Literal, ...Literal[]]>(
  values: T,
  options?: TypeOptions,
): EnumSchema<T[number]>;
declare function enumSchema<T extends EnumLike>(values: T, options?: TypeOptions): EnumSchema<T[keyof T & string]>;
export { enumSchema as enum };
/** An object with known properties. Unknown properties pass through untouched unless `.strict()`/`.strip()`. */
export declare function object<const S extends Shape>(shape: S, options?: TypeOptions): ObjectSchema<S>;
/** An array whose items all match `element`. */
export declare function array<T extends AnySchema>(element: T, options?: TypeOptions): ArraySchema<T>;
/** A fixed-length array with a schema per position. Add `.rest(schema)` for extra items. */
export declare function tuple<const T extends readonly [AnySchema, ...AnySchema[]] | readonly []>(
  items: T,
  options?: TypeOptions,
): TupleSchema<T>;
/** An object used as a dictionary: `v.record(v.string(), v.number())`. */
export declare function record<K extends Schema<string, string>, V extends AnySchema>(
  key: K,
  value: V,
  options?: TypeOptions,
): RecordSchema<K, V>;
/** Any one of `options`. Object members sharing a literal property are dispatched by it automatically. */
export declare function union<const T extends readonly [AnySchema, ...AnySchema[]]>(
  options: T,
  settings?: {
    message?: MessageSpec;
  },
): UnionSchema<T>;
/** All of `members` at once. Prefer `.extend()` for combining object shapes. */
export declare function intersection<const T extends readonly [AnySchema, ...AnySchema[]]>(
  members: T,
): IntersectionSchema<T>;
/** Defers schema creation, for recursive structures. */
export declare function lazy<T extends AnySchema>(getter: () => T): LazySchema<T>;
/** `value instanceof ctor`, e.g. `v.instance(File)` or `v.instance(URL)`. */
export declare function instance<T>(
  ctor: abstract new (...args: never[]) => T,
  options?: TypeOptions,
): InstanceSchema<T>;
/**
 * A value accepted by `check`. Pass a type guard to type it, or a type argument:
 * `v.custom<Uint8Array>((x) => x instanceof Uint8Array)`.
 */
export declare function custom<T>(
  check: ((value: unknown) => value is T) | ((value: unknown) => boolean),
  message?: MessageSpec,
): CustomSchema<T>;
/**
 * Opt-in conversions for string-typed sources such as environment variables, query strings and
 * form data. Each conversion is strict; see the docs for exact rules.
 */
export declare const coerce: {
  /** Numbers, and strings in decimal notation (`"42"`, `" -1.5e3 "`). `""`, `"0x10"`, `"1,000"` are rejected. */
  number: (options?: TypeOptions) => NumberSchema;
  /** Booleans, `"true"`/`"false"`/`"1"`/`"0"` (case-insensitive, trimmed), and the numbers `1`/`0`. */
  boolean: (options?: TypeOptions) => BooleanSchema;
  /** Dates, and strings or numbers that `new Date()` turns into a valid date. */
  date: (options?: TypeOptions) => DateSchema;
};

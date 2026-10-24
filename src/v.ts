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
export function string(options?: TypeOptions): StringSchema {
  return new StringSchema(options);
}

/** A finite number (`NaN` and `±Infinity` are rejected). */
export function number(options?: TypeOptions): NumberSchema {
  return new NumberSchema(options);
}

export function boolean(options?: TypeOptions): BooleanSchema {
  return new BooleanSchema(options);
}

/** A valid `Date` instance (invalid dates are rejected). */
export function date(options?: TypeOptions): DateSchema {
  return new DateSchema(options);
}

const nullSchema = (options?: TypeOptions) => new TypeSchema<null>('null', (value) => value === null, options?.message);
const undefinedSchema = (options?: TypeOptions) =>
  new TypeSchema<undefined>('undefined', (value) => value === undefined, options?.message);
export { nullSchema as null, undefinedSchema as undefined };

/** Accepts anything. The result is typed `unknown`, so it must be narrowed before use. */
export function unknown(): TypeSchema<unknown> {
  return new TypeSchema<unknown>('unknown', () => true);
}

/** Accepts nothing. */
export function never(options?: TypeOptions): TypeSchema<never> {
  return new TypeSchema<never>('never', () => false, options?.message);
}

/** Exactly `value` (compared with `===`). */
export function literal<const T extends Literal>(value: T, options?: TypeOptions): LiteralSchema<T> {
  return new LiteralSchema(value, options?.message);
}

/** A TypeScript `enum` object: its values (numeric enums' reverse mappings are ignored). */
type EnumLike = { readonly [key: string]: string | number };

function enumSchema<const T extends readonly [Literal, ...Literal[]]>(
  values: T,
  options?: TypeOptions,
): EnumSchema<T[number]>;
function enumSchema<T extends EnumLike>(values: T, options?: TypeOptions): EnumSchema<T[keyof T & string]>;
function enumSchema(values: readonly Literal[] | EnumLike, options?: TypeOptions): EnumSchema<Literal> {
  if (Array.isArray(values)) return new EnumSchema(values, options?.message);
  const object = values as EnumLike;
  // Numeric enums map values back to names (`E[0] === 'A'`); skip those reverse entries.
  const list = Object.keys(object)
    .filter((key) => typeof object[object[key]!] !== 'number')
    .map((key) => object[key]!);
  return new EnumSchema(list, options?.message);
}
export { enumSchema as enum };

/** An object with known properties. Unknown properties pass through untouched unless `.strict()`/`.strip()`. */
export function object<const S extends Shape>(shape: S, options?: TypeOptions): ObjectSchema<S> {
  return new ObjectSchema(shape, options?.message);
}

/** An array whose items all match `element`. */
export function array<T extends AnySchema>(element: T, options?: TypeOptions): ArraySchema<T> {
  return new ArraySchema(element, options?.message);
}

/** A fixed-length array with a schema per position. Add `.rest(schema)` for extra items. */
export function tuple<const T extends readonly [AnySchema, ...AnySchema[]] | readonly []>(
  items: T,
  options?: TypeOptions,
): TupleSchema<T> {
  return new TupleSchema(items, options?.message);
}

/** An object used as a dictionary: `v.record(v.string(), v.number())`. */
export function record<K extends Schema<string, string>, V extends AnySchema>(
  key: K,
  value: V,
  options?: TypeOptions,
): RecordSchema<K, V> {
  return new RecordSchema(key, value, options?.message);
}

/** Any one of `options`. Object members sharing a literal property are dispatched by it automatically. */
export function union<const T extends readonly [AnySchema, ...AnySchema[]]>(
  options: T,
  settings?: { message?: MessageSpec },
): UnionSchema<T> {
  return new UnionSchema(options, settings?.message);
}

/** All of `members` at once. Prefer `.extend()` for combining object shapes. */
export function intersection<const T extends readonly [AnySchema, ...AnySchema[]]>(members: T): IntersectionSchema<T> {
  return new IntersectionSchema(members);
}

/** Defers schema creation, for recursive structures. */
export function lazy<T extends AnySchema>(getter: () => T): LazySchema<T> {
  return new LazySchema(getter);
}

/** `value instanceof ctor`, e.g. `v.instance(File)` or `v.instance(URL)`. */
export function instance<T>(ctor: abstract new (...args: never[]) => T, options?: TypeOptions): InstanceSchema<T> {
  return new InstanceSchema(ctor, options?.message);
}

/**
 * A value accepted by `check`. Pass a type guard to type it, or a type argument:
 * `v.custom<Uint8Array>((x) => x instanceof Uint8Array)`.
 */
export function custom<T>(
  check: ((value: unknown) => value is T) | ((value: unknown) => boolean),
  message?: MessageSpec,
): CustomSchema<T> {
  return new CustomSchema<T>(check, message);
}

function coerced<S extends { _coerce: boolean }>(schema: S): S {
  schema._coerce = true;
  return schema;
}

/**
 * Opt-in conversions for string-typed sources such as environment variables, query strings and
 * form data. Each conversion is strict; see the docs for exact rules.
 */
export const coerce = {
  /** Numbers, and strings in decimal notation (`"42"`, `" -1.5e3 "`). `""`, `"0x10"`, `"1,000"` are rejected. */
  number: (options?: TypeOptions): NumberSchema => coerced(new NumberSchema(options)),
  /** Booleans, `"true"`/`"false"`/`"1"`/`"0"` (case-insensitive, trimmed), and the numbers `1`/`0`. */
  boolean: (options?: TypeOptions): BooleanSchema => coerced(new BooleanSchema(options)),
  /** Dates, and strings or numbers that `new Date()` turns into a valid date. */
  date: (options?: TypeOptions): DateSchema => coerced(new DateSchema(options)),
};

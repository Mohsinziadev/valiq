import type { MessageSpec } from '../core/issues.ts';
import { OptionalSchema, Schema, type AnySchema, type Compiled } from '../core/schema.ts';
import { EnumSchema } from './primitives.ts';
/** The property schemas of an object schema. */
export type Shape = {
  readonly [key: string]: AnySchema;
};
/** How properties that are not in the shape are handled. */
export type UnknownKeys = 'passthrough' | 'strict' | 'strip';
type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};
type OptionalKeys<S extends Shape, IO extends 'input' | 'output'> = {
  [K in keyof S]: undefined extends S[K]['~types'][IO] ? K : never;
}[keyof S];
type ObjectType<S extends Shape, IO extends 'input' | 'output'> = Simplify<
  {
    -readonly [K in Exclude<keyof S, OptionalKeys<S, IO>>]: S[K]['~types'][IO];
  } & {
    -readonly [K in OptionalKeys<S, IO>]?: S[K]['~types'][IO];
  }
>;
type WithCatchall<T, C extends AnySchema | undefined, IO extends 'input' | 'output'> = C extends AnySchema
  ? T & {
      [key: string]: C['~types'][IO];
    }
  : T;
/** The output type of an object schema with shape `S`. */
export type ObjectOutput<S extends Shape, C extends AnySchema | undefined = undefined> = WithCatchall<
  ObjectType<S, 'output'>,
  C,
  'output'
>;
/** The input type of an object schema with shape `S`. */
export type ObjectInput<S extends Shape, C extends AnySchema | undefined = undefined> = WithCatchall<
  ObjectType<S, 'input'>,
  C,
  'input'
>;
type PartialShape<S extends Shape, K extends keyof S> = Simplify<{
  [P in keyof S]: P extends K ? OptionalSchema<S[P]> : S[P];
}>;
type Unwrapped<S extends AnySchema> = S extends OptionalSchema<infer Inner> ? Unwrapped<Inner> : S;
type RequiredShape<S extends Shape, K extends keyof S> = Simplify<{
  [P in keyof S]: P extends K ? Unwrapped<S[P]> : S[P];
}>;
export declare class ObjectSchema<S extends Shape, C extends AnySchema | undefined = undefined> extends Schema<
  ObjectOutput<S, C>,
  ObjectInput<S, C>
> {
  /** The property schemas. */
  readonly shape: S;
  private readonly _message?;
  readonly kind = 'object';
  /** @internal */
  _unknownKeys: UnknownKeys;
  /** @internal */
  _catchall: C | undefined;
  constructor(
    /** The property schemas. */
    shape: S,
    _message?: MessageSpec | undefined,
  );
  /** @internal */
  protected _build(): Compiled;
  /** Rejects properties that are not in the shape (`unrecognized_keys`). */
  strict(): ObjectSchema<S>;
  /** Removes properties that are not in the shape from the output. The input is not modified. */
  strip(): ObjectSchema<S>;
  /** Keeps unknown properties untouched (the default). */
  passthrough(): ObjectSchema<S>;
  /** Validates every property that is not in the shape with `schema`. */
  catchall<T extends AnySchema>(schema: T): ObjectSchema<S, T>;
  /** Adds or replaces properties. */
  extend<E extends Shape>(shape: E): ObjectSchema<Simplify<Omit<S, keyof E> & E>, C>;
  /** Keeps only the listed properties. */
  pick<K extends keyof S & string>(...keys: K[]): ObjectSchema<Simplify<Pick<S, K>>, C>;
  /** Removes the listed properties. */
  omit<K extends keyof S & string>(...keys: K[]): ObjectSchema<Simplify<Omit<S, K>>, C>;
  /** Makes the listed properties (or all of them) optional. */
  partial<K extends keyof S & string = keyof S & string>(...keys: K[]): ObjectSchema<PartialShape<S, K>, C>;
  /** Removes `.optional()` from the listed properties (or all of them). */
  required<K extends keyof S & string = keyof S & string>(...keys: K[]): ObjectSchema<RequiredShape<S, K>, C>;
  /** An enum schema of the property names. */
  keyof(): EnumSchema<keyof S & string>;
}
export {};

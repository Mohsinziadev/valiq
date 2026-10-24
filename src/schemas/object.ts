import { copyObject, FAIL, hasOwn, prefix, readOwn, report, setProp, typeName, type Ctx } from '../core/context.ts';
import type { MessageSpec } from '../core/issues.ts';
import { OptionalSchema, Schema, type AnySchema, type Compiled } from '../core/schema.ts';
import { EnumSchema } from './primitives.ts';

/** The property schemas of an object schema. */
export type Shape = { readonly [key: string]: AnySchema };

/** How properties that are not in the shape are handled. */
export type UnknownKeys = 'passthrough' | 'strict' | 'strip';

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionalKeys<S extends Shape, IO extends 'input' | 'output'> = {
  [K in keyof S]: undefined extends S[K]['~types'][IO] ? K : never;
}[keyof S];

type ObjectType<S extends Shape, IO extends 'input' | 'output'> = Simplify<
  { -readonly [K in Exclude<keyof S, OptionalKeys<S, IO>>]: S[K]['~types'][IO] } & {
    -readonly [K in OptionalKeys<S, IO>]?: S[K]['~types'][IO];
  }
>;

type WithCatchall<T, C extends AnySchema | undefined, IO extends 'input' | 'output'> = C extends AnySchema
  ? T & { [key: string]: C['~types'][IO] }
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

const MAX_LISTED_KEYS = 100;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ObjectSchema<S extends Shape, C extends AnySchema | undefined = undefined> extends Schema<
  ObjectOutput<S, C>,
  ObjectInput<S, C>
> {
  readonly kind = 'object';
  /** @internal */
  _unknownKeys: UnknownKeys = 'passthrough';
  /** @internal */
  _catchall: C | undefined;

  constructor(
    /** The property schemas. */
    readonly shape: S,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }

  /** @internal */
  protected _build(): Compiled {
    const shape = this.shape;
    const keys = Object.keys(shape);
    const n = keys.length;
    const compiled = keys.map((key) => shape[key]!._get());
    const runs = compiled.map((c) => c.run);
    const checks = compiled.map((c) => c.is);
    const known = new Set(keys);
    const mode = this._unknownKeys;
    const catchall = this._catchall?._get();
    const message = this._message;
    const pure = mode !== 'strip' && compiled.every((c) => c.pure) && (catchall === undefined || catchall.pure);

    const hasUnknown = (input: object): boolean => {
      for (const key in input) if (hasOwn(input, key) && !known.has(key)) return true;
      return false;
    };

    const is = (input: unknown): boolean => {
      if (!isObject(input)) return false;
      for (let i = 0; i < n; i++) if (!checks[i]!(readOwn(input, keys[i]!))) return false;
      if (catchall !== undefined) {
        for (const key in input) {
          if (hasOwn(input, key) && !known.has(key) && !catchall.is(input[key])) return false;
        }
      } else if (mode === 'strict') {
        return !hasUnknown(input);
      }
      return true;
    };

    const run = (input: unknown, ctx: Ctx): unknown => {
      if (!isObject(input)) {
        report(ctx, { code: 'invalid_type', expected: 'object', received: typeName(input) }, message);
        return FAIL;
      }
      let out: Record<string, unknown> = input;
      let ok = true;
      for (let i = 0; i < n; i++) {
        const key = keys[i]!;
        const value = readOwn(input, key);
        const from = ctx.issues.length;
        const result = runs[i]!(value, ctx);
        if (result === FAIL) {
          ok = false;
          if (value === undefined) {
            // A missing property: one clear "required" issue instead of "expected X, received undefined".
            ctx.issues.length = from;
            report(ctx, { code: 'required', path: [key] });
          } else {
            prefix(ctx, from, key);
          }
          if (ctx.abort) return FAIL;
        } else if (result !== value) {
          if (out === input) out = copyObject(input);
          setProp(out, key, result);
        }
      }

      if (catchall !== undefined) {
        for (const key in input) {
          if (!hasOwn(input, key) || known.has(key)) continue;
          const value = input[key];
          const from = ctx.issues.length;
          const result = catchall.run(value, ctx);
          if (result === FAIL) {
            ok = false;
            prefix(ctx, from, key);
            if (ctx.abort) return FAIL;
          } else if (result !== value) {
            if (out === input) out = copyObject(input);
            setProp(out, key, result);
          }
        }
      } else if (mode === 'strict') {
        const extra: string[] = [];
        for (const key in input) {
          if (hasOwn(input, key) && !known.has(key)) {
            extra.push(key);
            if (extra.length === MAX_LISTED_KEYS) break;
          }
        }
        if (extra.length > 0) {
          report(ctx, { code: 'unrecognized_keys', keys: extra });
          return FAIL;
        }
      } else if (mode === 'strip' && ok && hasUnknown(input)) {
        const stripped: Record<string, unknown> = {};
        for (const key of keys) if (hasOwn(out, key)) setProp(stripped, key, out[key]);
        out = stripped;
      }
      return ok ? out : FAIL;
    };

    return { run, is, pure };
  }

  /** Rejects properties that are not in the shape (`unrecognized_keys`). */
  strict(): ObjectSchema<S> {
    return this._with({ _unknownKeys: 'strict', _catchall: undefined }) as ObjectSchema<S>;
  }

  /** Removes properties that are not in the shape from the output. The input is not modified. */
  strip(): ObjectSchema<S> {
    return this._with({ _unknownKeys: 'strip', _catchall: undefined }) as ObjectSchema<S>;
  }

  /** Keeps unknown properties untouched (the default). */
  passthrough(): ObjectSchema<S> {
    return this._with({ _unknownKeys: 'passthrough', _catchall: undefined }) as ObjectSchema<S>;
  }

  /** Validates every property that is not in the shape with `schema`. */
  catchall<T extends AnySchema>(schema: T): ObjectSchema<S, T> {
    return this._with({ _unknownKeys: 'passthrough', _catchall: schema }) as unknown as ObjectSchema<S, T>;
  }

  /** Adds or replaces properties. */
  extend<E extends Shape>(shape: E): ObjectSchema<Simplify<Omit<S, keyof E> & E>, C> {
    return this._with({ shape: { ...this.shape, ...shape }, _refinements: undefined }) as unknown as ObjectSchema<
      Simplify<Omit<S, keyof E> & E>,
      C
    >;
  }

  /** Keeps only the listed properties. */
  pick<K extends keyof S & string>(...keys: K[]): ObjectSchema<Simplify<Pick<S, K>>, C> {
    const shape: Record<string, AnySchema> = {};
    for (const key of keys) if (hasOwn(this.shape, key)) shape[key] = this.shape[key]!;
    return this._with({ shape, _refinements: undefined }) as unknown as ObjectSchema<Simplify<Pick<S, K>>, C>;
  }

  /** Removes the listed properties. */
  omit<K extends keyof S & string>(...keys: K[]): ObjectSchema<Simplify<Omit<S, K>>, C> {
    const shape: Record<string, AnySchema> = { ...this.shape };
    for (const key of keys) delete shape[key];
    return this._with({ shape, _refinements: undefined }) as unknown as ObjectSchema<Simplify<Omit<S, K>>, C>;
  }

  /** Makes the listed properties (or all of them) optional. */
  partial<K extends keyof S & string = keyof S & string>(...keys: K[]): ObjectSchema<PartialShape<S, K>, C> {
    const only = keys.length === 0 ? undefined : new Set<string>(keys);
    const shape: Record<string, AnySchema> = {};
    for (const [key, schema] of Object.entries(this.shape)) {
      shape[key] = only === undefined || only.has(key) ? new OptionalSchema(schema) : schema;
    }
    return this._with({ shape, _refinements: undefined }) as unknown as ObjectSchema<PartialShape<S, K>, C>;
  }

  /** Removes `.optional()` from the listed properties (or all of them). */
  required<K extends keyof S & string = keyof S & string>(...keys: K[]): ObjectSchema<RequiredShape<S, K>, C> {
    const only = keys.length === 0 ? undefined : new Set<string>(keys);
    const shape: Record<string, AnySchema> = {};
    for (const [key, schema] of Object.entries(this.shape)) {
      let inner = schema;
      if (only === undefined || only.has(key))
        while (inner.kind === 'optional') inner = (inner as OptionalSchema<AnySchema>).inner;
      shape[key] = inner;
    }
    return this._with({ shape, _refinements: undefined }) as unknown as ObjectSchema<RequiredShape<S, K>, C>;
  }

  /** An enum schema of the property names. */
  keyof(): EnumSchema<keyof S & string> {
    return new EnumSchema(Object.keys(this.shape) as (keyof S & string)[]);
  }
}

import { createCtx, FAIL, report, silentCtx, type Ctx, type ParseOptions } from './context.ts';
import { ValiqError } from './error.ts';
import type { Issue, MessageSpec, PathKey } from './issues.ts';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from './standard.ts';
import { toJSONSchema, type JSONSchemaTarget } from '../to-json-schema.ts';

/** The executable form of a schema, built once and cached. */
export interface Compiled {
  /** Validates `value` and returns the output, or `FAIL` after reporting issues to `ctx`. */
  run(value: unknown, ctx: Ctx): unknown;
  /** Allocation-free validity check. */
  is(value: unknown): boolean;
  /** True when `run` always returns its input unchanged (no transforms, defaults or stripping). */
  pure: boolean;
}

/** Documentation attached with `.meta()`; exported to JSON Schema. */
export interface SchemaMeta {
  title?: string;
  description?: string;
  examples?: unknown[];
  deprecated?: boolean;
}

export interface RefineOptions {
  message?: MessageSpec;
  /** Path of the issue relative to the refined value, e.g. `['confirmPassword']`. */
  path?: PathKey[];
  /** Extra data copied into the issue's `params`. */
  params?: Record<string, unknown>;
}

interface Refinement {
  check: (value: unknown) => boolean;
  message: MessageSpec | undefined;
  path: PathKey[] | undefined;
  params: Record<string, unknown> | undefined;
}

export interface SafeParseSuccess<T> {
  success: true;
  data: T;
  error?: undefined;
}

export interface SafeParseFailure {
  success: false;
  data?: undefined;
  error: ValiqError;
}

export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

type StandardProps<In, Out> = StandardSchemaV1.Props<In, Out> & StandardJSONSchemaV1.Props<In, Out>;

/** Any Valiq schema. Use as a constraint: `<S extends AnySchema>`. */
export type AnySchema = Schema<unknown, unknown>;

/** The output type of a schema: what `parse` returns. */
export type Infer<S extends AnySchema> = S['~types']['output'];

/** The input type of a schema: what it accepts before defaults and transforms. */
export type Input<S extends AnySchema> = S['~types']['input'];

declare const brandKey: unique symbol;

/** A nominal marker added by `.brand()`. */
export interface Brand<B extends string | symbol> {
  readonly [brandKey]: B;
}

function withRefinements(inner: Compiled, refinements: readonly Refinement[]): Compiled {
  const run = (value: unknown, ctx: Ctx): unknown => {
    const out = inner.run(value, ctx);
    if (out === FAIL) return FAIL;
    let ok = true;
    for (const refinement of refinements) {
      if (refinement.check(out)) continue;
      report(
        ctx,
        { code: 'custom', path: refinement.path ? [...refinement.path] : [], params: refinement.params },
        refinement.message,
      );
      ok = false;
      if (ctx.abort) break;
    }
    return ok ? out : FAIL;
  };
  const is = inner.pure
    ? (value: unknown): boolean => {
        if (!inner.is(value)) return false;
        for (const refinement of refinements) if (!refinement.check(value)) return false;
        return true;
      }
    : (value: unknown): boolean => run(value, silentCtx()) !== FAIL;
  return { run, is, pure: inner.pure };
}

/** The issues of a failed run; never empty. */
function issuesOf(ctx: Ctx): Issue[] {
  if (ctx.issues.length === 0) report(ctx, { code: 'custom' });
  return ctx.issues;
}

/**
 * A `ValiqError` for `safeParse`, which returns rather than throws it: capturing a stack trace
 * would dominate the cost of reporting invalid input and point nowhere useful.
 */
function createError(issues: Issue[]): ValiqError {
  const E = Error as { stackTraceLimit?: number };
  const limit = E.stackTraceLimit;
  if (typeof limit !== 'number') return new ValiqError(issues);
  try {
    E.stackTraceLimit = 0;
  } catch {
    return new ValiqError(issues); // Frozen intrinsics (e.g. SES lockdown).
  }
  try {
    return new ValiqError(issues);
  } finally {
    E.stackTraceLimit = limit;
  }
}

/** Wraps a `run` function into a full `Compiled` whose `is` reuses it silently. */
export function fromRun(run: Compiled['run'], pure = false): Compiled {
  return { run, is: (value) => run(value, silentCtx()) !== FAIL, pure };
}

/**
 * Base class of every schema. Schemas are immutable: every method returns a new schema.
 * Validation code is built on first use and cached.
 */
export abstract class Schema<Out = unknown, In = Out>
  implements StandardSchemaV1<In, Out>, StandardJSONSchemaV1<In, Out>
{
  /** Type-level only: the input and output types. Use `Infer<typeof S>` instead of reading it. */
  declare readonly '~types': { readonly input: In; readonly output: Out };

  /** Discriminates the schema class, e.g. `"string"` or `"object"`. */
  abstract readonly kind: string;

  /** @internal */
  _meta: SchemaMeta | undefined;
  /** @internal */
  _refinements: readonly Refinement[] | undefined;
  /** @internal */
  private _compiled: Compiled | undefined;
  /** @internal */
  private _standard: StandardProps<In, Out> | undefined;

  /** @internal Builds the validator for this schema, without refinements. */
  protected abstract _build(): Compiled;

  /** @internal */
  _get(): Compiled {
    let compiled = this._compiled;
    if (compiled === undefined) {
      compiled = this._build();
      if (this._refinements !== undefined) compiled = withRefinements(compiled, this._refinements);
      this._compiled = compiled;
    }
    return compiled;
  }

  /** @internal Returns a modified copy; the original is left untouched. */
  protected _with(patch: Record<string, unknown>): this {
    const copy = Object.create(Object.getPrototypeOf(this) as object) as this;
    Object.assign(copy, this, patch);
    copy._compiled = undefined;
    copy._standard = undefined;
    return copy;
  }

  /** Returns the validated (and possibly transformed) value, or throws a `ValiqError`. */
  parse(data: unknown, options?: ParseOptions): Out {
    const compiled = this._get();
    // Pure schemas return their input, so a boolean pass is enough for valid data.
    if (compiled.pure && compiled.is(data)) return data as Out;
    const ctx = createCtx(options);
    const out = compiled.run(data, ctx);
    if (out !== FAIL) return out as Out;
    throw new ValiqError(issuesOf(ctx));
  }

  /** Returns `{ success: true, data }` or `{ success: false, error }`. Never throws for invalid data. */
  safeParse(data: unknown, options?: ParseOptions): SafeParseResult<Out> {
    const compiled = this._get();
    if (compiled.pure && compiled.is(data)) return { success: true, data: data as Out };
    const ctx = createCtx(options);
    const out = compiled.run(data, ctx);
    if (out !== FAIL) return { success: true, data: out as Out };
    return { success: false, error: createError(issuesOf(ctx)) };
  }

  /** A type guard: true when `data` is valid. Allocation-free for most schemas. */
  is(data: unknown): data is In {
    return this._get().is(data);
  }

  /** Also accepts `undefined`. Inside `v.object`, the property becomes optional. */
  optional(): OptionalSchema<this> {
    return new OptionalSchema(this);
  }

  /** Also accepts `null`. */
  nullable(): NullableSchema<this> {
    return new NullableSchema(this);
  }

  /** Also accepts `null` and `undefined`. */
  nullish(): OptionalSchema<NullableSchema<this>> {
    return new OptionalSchema(new NullableSchema(this));
  }

  /**
   * Uses `value` when the input is `undefined`. Objects and arrays are cloned for every use; pass a
   * function to compute the default instead. The default is not validated.
   */
  default(value: Exclude<Out, undefined> | (() => Exclude<Out, undefined>)): DefaultSchema<this> {
    return new DefaultSchema(this, value);
  }

  /**
   * Adds a custom check that runs after the schema itself passed. `check` must be side-effect
   * free: Valiq may call it more than once for invalid input.
   */
  refine(check: (value: Out) => boolean, options?: string | RefineOptions): this {
    const opts = typeof options === 'string' ? { message: options } : (options ?? {});
    const refinement: Refinement = {
      check: check as (value: unknown) => boolean,
      message: opts.message,
      path: opts.path,
      params: opts.params,
    };
    return this._with({ _refinements: [...(this._refinements ?? []), refinement] });
  }

  /** Maps the validated value to something else. The function receives already-valid data. */
  transform<T>(fn: (value: Out) => T): TransformSchema<this, T> {
    return new TransformSchema(this, fn as (value: unknown) => T);
  }

  /** Validates the output of this schema with `next`, e.g. after a transform. */
  pipe<S extends AnySchema>(next: S): PipeSchema<this, S> {
    return new PipeSchema(this, next);
  }

  /** Marks the output type as nominal, e.g. `Brand<'UserId'>`. Type-level only. */
  brand<B extends string | symbol>(): BrandSchema<this, B> {
    return new BrandSchema<this, B>(this);
  }

  /** Attaches documentation that is exported by `toJSONSchema`. */
  meta(meta: SchemaMeta): this {
    return this._with({ _meta: { ...this._meta, ...meta } });
  }

  /** Standard Schema v1 and Standard JSON Schema v1 support, for tRPC, form libraries and more. */
  get '~standard'(): StandardProps<In, Out> {
    return (this._standard ??= {
      version: 1,
      vendor: 'valiq',
      validate: (value: unknown) => {
        const result = this.safeParse(value);
        return result.success ? { value: result.data } : { issues: result.error.issues };
      },
      jsonSchema: {
        input: (options) => toJSONSchema(this, { target: options.target as JSONSchemaTarget, io: 'input' }),
        output: (options) => toJSONSchema(this, { target: options.target as JSONSchemaTarget, io: 'output' }),
      },
    });
  }
}

export class OptionalSchema<S extends AnySchema> extends Schema<Infer<S> | undefined, Input<S> | undefined> {
  readonly kind = 'optional';
  constructor(readonly inner: S) {
    super();
  }
  /** The wrapped schema. */
  unwrap(): S {
    return this.inner;
  }
  /** @internal */
  protected _build(): Compiled {
    const inner = this.inner._get();
    const run = inner.run;
    const is = inner.is;
    return {
      run: (value, ctx) => (value === undefined ? undefined : run(value, ctx)),
      is: (value) => value === undefined || is(value),
      pure: inner.pure,
    };
  }
}

export class NullableSchema<S extends AnySchema> extends Schema<Infer<S> | null, Input<S> | null> {
  readonly kind = 'nullable';
  constructor(readonly inner: S) {
    super();
  }
  unwrap(): S {
    return this.inner;
  }
  /** @internal */
  protected _build(): Compiled {
    const inner = this.inner._get();
    const run = inner.run;
    const is = inner.is;
    return {
      run: (value, ctx) => (value === null ? null : run(value, ctx)),
      is: (value) => value === null || is(value),
      pure: inner.pure,
    };
  }
}

function defaultFactory(value: unknown): () => unknown {
  if (typeof value === 'function') return value as () => unknown;
  if (typeof value !== 'object' || value === null) return () => value;
  structuredClone(value); // Fails now, at definition time, for values that cannot be cloned.
  return () => structuredClone(value);
}

export class DefaultSchema<S extends AnySchema> extends Schema<Exclude<Infer<S>, undefined>, Input<S> | undefined> {
  readonly kind = 'default';
  /** @internal */
  readonly _factory: () => unknown;
  constructor(
    readonly inner: S,
    readonly defaultValue: unknown,
  ) {
    super();
    this._factory = defaultFactory(defaultValue);
  }
  unwrap(): S {
    return this.inner;
  }
  /** @internal */
  protected _build(): Compiled {
    const inner = this.inner._get();
    const run = inner.run;
    const is = inner.is;
    const factory = this._factory;
    return {
      run: (value, ctx) => (value === undefined ? factory() : run(value, ctx)),
      is: (value) => value === undefined || is(value),
      pure: false,
    };
  }
}

export class TransformSchema<S extends AnySchema, T> extends Schema<T, Input<S>> {
  readonly kind = 'transform';
  constructor(
    readonly inner: S,
    readonly fn: (value: unknown) => T,
  ) {
    super();
  }
  /** @internal */
  protected _build(): Compiled {
    const inner = this.inner._get();
    const run = inner.run;
    const fn = this.fn;
    return {
      run: (value, ctx) => {
        const out = run(value, ctx);
        return out === FAIL ? FAIL : fn(out);
      },
      is: inner.is,
      pure: false,
    };
  }
}

export class PipeSchema<A extends AnySchema, B extends AnySchema> extends Schema<Infer<B>, Input<A>> {
  readonly kind = 'pipe';
  constructor(
    readonly first: A,
    readonly second: B,
  ) {
    super();
  }
  /** @internal */
  protected _build(): Compiled {
    const a = this.first._get();
    const b = this.second._get();
    const run = (value: unknown, ctx: Ctx): unknown => {
      const mid = a.run(value, ctx);
      return mid === FAIL ? FAIL : b.run(mid, ctx);
    };
    if (a.pure) return { run, is: (value) => a.is(value) && b.is(value), pure: b.pure };
    return fromRun(run);
  }
}

export class BrandSchema<S extends AnySchema, B extends string | symbol> extends Schema<Infer<S> & Brand<B>, Input<S>> {
  readonly kind = 'brand';
  constructor(readonly inner: S) {
    super();
  }
  /** @internal */
  protected _build(): Compiled {
    return this.inner._get();
  }
}

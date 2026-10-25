import { type Ctx, type ParseOptions } from './context.ts';
import { ValiqError } from './error.ts';
import type { MessageSpec, PathKey } from './issues.ts';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from './standard.ts';
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
/** Any valiq-js schema. Use as a constraint: `<S extends AnySchema>`. */
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
/** Wraps a `run` function into a full `Compiled` whose `is` reuses it silently. */
export declare function fromRun(run: Compiled['run'], pure?: boolean): Compiled;
/**
 * Base class of every schema. Schemas are immutable: every method returns a new schema.
 * Validation code is built on first use and cached.
 */
export declare abstract class Schema<Out = unknown, In = Out>
  implements StandardSchemaV1<In, Out>, StandardJSONSchemaV1<In, Out>
{
  /** Type-level only: the input and output types. Use `Infer<typeof S>` instead of reading it. */
  readonly '~types': {
    readonly input: In;
    readonly output: Out;
  };
  /** Discriminates the schema class, e.g. `"string"` or `"object"`. */
  abstract readonly kind: string;
  /** @internal */
  _meta: SchemaMeta | undefined;
  /** @internal */
  _refinements: readonly Refinement[] | undefined;
  /** @internal */
  private _compiled;
  /** @internal */
  private _standard;
  /** @internal Builds the validator for this schema, without refinements. */
  protected abstract _build(): Compiled;
  /** @internal */
  _get(): Compiled;
  /** @internal Returns a modified copy; the original is left untouched. */
  protected _with(patch: Record<string, unknown>): this;
  /** Returns the validated (and possibly transformed) value, or throws a `ValiqError`. */
  parse(data: unknown, options?: ParseOptions): Out;
  /** Returns `{ success: true, data }` or `{ success: false, error }`. Never throws for invalid data. */
  safeParse(data: unknown, options?: ParseOptions): SafeParseResult<Out>;
  /** A type guard: true when `data` is valid. Allocation-free for most schemas. */
  is(data: unknown): data is In;
  /** Also accepts `undefined`. Inside `v.object`, the property becomes optional. */
  optional(): OptionalSchema<this>;
  /** Also accepts `null`. */
  nullable(): NullableSchema<this>;
  /** Also accepts `null` and `undefined`. */
  nullish(): OptionalSchema<NullableSchema<this>>;
  /**
   * Uses `value` when the input is `undefined`. Objects and arrays are cloned for every use; pass a
   * function to compute the default instead. The default is not validated.
   */
  default(value: Exclude<Out, undefined> | (() => Exclude<Out, undefined>)): DefaultSchema<this>;
  /**
   * Adds a custom check that runs after the schema itself passed. `check` must be side-effect
   * free: valiq-js may call it more than once for invalid input.
   */
  refine(check: (value: Out) => boolean, options?: string | RefineOptions): this;
  /** Maps the validated value to something else. The function receives already-valid data. */
  transform<T>(fn: (value: Out) => T): TransformSchema<this, T>;
  /** Validates the output of this schema with `next`, e.g. after a transform. */
  pipe<S extends AnySchema>(next: S): PipeSchema<this, S>;
  /** Marks the output type as nominal, e.g. `Brand<'UserId'>`. Type-level only. */
  brand<B extends string | symbol>(): BrandSchema<this, B>;
  /** Attaches documentation that is exported by `toJSONSchema`. */
  meta(meta: SchemaMeta): this;
  /** Standard Schema v1 and Standard JSON Schema v1 support, for tRPC, form libraries and more. */
  get '~standard'(): StandardProps<In, Out>;
}
export declare class OptionalSchema<S extends AnySchema> extends Schema<Infer<S> | undefined, Input<S> | undefined> {
  readonly inner: S;
  readonly kind = 'optional';
  constructor(inner: S);
  /** The wrapped schema. */
  unwrap(): S;
  /** @internal */
  protected _build(): Compiled;
}
export declare class NullableSchema<S extends AnySchema> extends Schema<Infer<S> | null, Input<S> | null> {
  readonly inner: S;
  readonly kind = 'nullable';
  constructor(inner: S);
  unwrap(): S;
  /** @internal */
  protected _build(): Compiled;
}
export declare class DefaultSchema<S extends AnySchema> extends Schema<
  Exclude<Infer<S>, undefined>,
  Input<S> | undefined
> {
  readonly inner: S;
  readonly defaultValue: unknown;
  readonly kind = 'default';
  /** @internal */
  readonly _factory: () => unknown;
  constructor(inner: S, defaultValue: unknown);
  unwrap(): S;
  /** @internal */
  protected _build(): Compiled;
}
export declare class TransformSchema<S extends AnySchema, T> extends Schema<T, Input<S>> {
  readonly inner: S;
  readonly fn: (value: unknown) => T;
  readonly kind = 'transform';
  constructor(inner: S, fn: (value: unknown) => T);
  /** @internal */
  protected _build(): Compiled;
}
export declare class PipeSchema<A extends AnySchema, B extends AnySchema> extends Schema<Infer<B>, Input<A>> {
  readonly first: A;
  readonly second: B;
  readonly kind = 'pipe';
  constructor(first: A, second: B);
  /** @internal */
  protected _build(): Compiled;
}
export declare class BrandSchema<S extends AnySchema, B extends string | symbol> extends Schema<
  Infer<S> & Brand<B>,
  Input<S>
> {
  readonly inner: S;
  readonly kind = 'brand';
  constructor(inner: S);
  /** @internal */
  protected _build(): Compiled;
}
export {};

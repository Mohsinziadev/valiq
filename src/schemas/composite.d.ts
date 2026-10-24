import { type Ctx } from '../core/context.ts';
import type { Issue, MessageSpec } from '../core/issues.ts';
import { Schema, type AnySchema, type Compiled } from '../core/schema.ts';
type RecordType<
  K extends AnySchema,
  V extends AnySchema,
  IO extends 'input' | 'output',
> = string extends K['~types'][IO]
  ? Record<K['~types'][IO] & PropertyKey, V['~types'][IO]>
  : Partial<Record<K['~types'][IO] & PropertyKey, V['~types'][IO]>>;
/** Objects used as dictionaries: every own key is checked by `key`, every value by `value`. */
export declare class RecordSchema<K extends Schema<string, string>, V extends AnySchema> extends Schema<
  RecordType<K, V, 'output'>,
  RecordType<K, V, 'input'>
> {
  readonly keySchema: K;
  readonly valueSchema: V;
  private readonly _message?;
  readonly kind = 'record';
  constructor(keySchema: K, valueSchema: V, _message?: MessageSpec | undefined);
  /** @internal */
  protected _build(): Compiled;
}
type Options = readonly [AnySchema, ...AnySchema[]];
/**
 * Reports a union where no member matched. When exactly one member got past its type check, its
 * issues are the useful ones and are reported directly; when all failed on type alone, a single
 * `invalid_type` lists the expected types; otherwise an `invalid_union` carries every branch.
 */
export declare function reportUnionFailure(
  ctx: Ctx,
  branches: Issue[][],
  input: unknown,
  message: MessageSpec | undefined,
  extra?: {
    keyword: string;
    schemaPath: string;
  },
): void;
/**
 * Accepts a value matching any member; the output comes from the first match. Object members that
 * share a literal property (e.g. `type`) are detected automatically and dispatched in O(1), with
 * issues from the selected member only.
 */
export declare class UnionSchema<T extends Options> extends Schema<
  T[number]['~types']['output'],
  T[number]['~types']['input']
> {
  readonly options: T;
  private readonly _message?;
  readonly kind = 'union';
  constructor(options: T, _message?: MessageSpec | undefined);
  /** The property used to select a member, when one was detected. */
  get discriminator(): string | undefined;
  /** @internal */
  protected _build(): Compiled;
}
type Intersect<T extends readonly AnySchema[], IO extends 'input' | 'output'> = T extends readonly [
  infer H extends AnySchema,
  ...infer R extends AnySchema[],
]
  ? H['~types'][IO] & Intersect<R, IO>
  : unknown;
/**
 * Accepts values matching every member. When members transform an object, the properties each
 * one changed are merged into a copy of the input (later members win); for other values the first
 * changed output is returned.
 */
export declare class IntersectionSchema<T extends Options> extends Schema<
  Intersect<T, 'output'>,
  Intersect<T, 'input'>
> {
  readonly members: T;
  readonly kind = 'intersection';
  constructor(members: T);
  /** @internal */
  protected _build(): Compiled;
}
/** A schema resolved on first use, for recursive types. Annotate the variable's type explicitly. */
export declare class LazySchema<T extends AnySchema> extends Schema<T['~types']['output'], T['~types']['input']> {
  private readonly _getter;
  readonly kind = 'lazy';
  private _resolved;
  constructor(_getter: () => T);
  /** The schema returned by the getter. */
  get schema(): T;
  /** @internal */
  protected _build(): Compiled;
}
export {};

import type { MessageSpec } from '../core/issues.ts';
import { Schema, type AnySchema, type Compiled } from '../core/schema.ts';
import type { CheckOptions } from './primitives.ts';
interface SizeCheck {
  min?: {
    n: number;
    exact: boolean;
    message: MessageSpec | undefined;
  };
  max?: {
    n: number;
    exact: boolean;
    message: MessageSpec | undefined;
  };
}
export declare class ArraySchema<T extends AnySchema> extends Schema<T['~types']['output'][], T['~types']['input'][]> {
  /** The item schema. */
  readonly element: T;
  private readonly _message?;
  readonly kind = 'array';
  /** @internal */
  _sizes: SizeCheck;
  /** @internal */
  _unique: MessageSpec | undefined | false;
  constructor(
    /** The item schema. */
    element: T,
    _message?: MessageSpec | undefined,
  );
  /** @internal */
  protected _build(): Compiled;
  private _size;
  /** At least `n` items. */
  min(n: number, options?: CheckOptions): this;
  /** At most `n` items. Larger arrays are rejected without validating their items. */
  max(n: number, options?: CheckOptions): this;
  /** Exactly `n` items. */
  length(n: number, options?: CheckOptions): this;
  /** No two items may be deeply equal (JSON semantics). */
  unique(options?: CheckOptions): this;
}
type TupleItems = readonly [AnySchema, ...AnySchema[]] | readonly [];
type TupleType<T extends TupleItems, IO extends 'input' | 'output'> = {
  -readonly [K in keyof T]: T[K]['~types'][IO];
};
type WithRest<T extends unknown[], R extends AnySchema | undefined, IO extends 'input' | 'output'> = R extends AnySchema
  ? [...T, ...R['~types'][IO][]]
  : T;
export declare class TupleSchema<T extends TupleItems, R extends AnySchema | undefined = undefined> extends Schema<
  WithRest<TupleType<T, 'output'>, R, 'output'>,
  WithRest<TupleType<T, 'input'>, R, 'input'>
> {
  readonly items: T;
  private readonly _message?;
  readonly kind = 'tuple';
  /** @internal */
  _rest: R | undefined;
  constructor(items: T, _message?: MessageSpec | undefined);
  /** @internal */
  protected _build(): Compiled;
  /** Allows any number of extra items after the fixed ones, each validated by `schema`. */
  rest<S extends AnySchema>(schema: S): TupleSchema<T, S>;
}
export {};

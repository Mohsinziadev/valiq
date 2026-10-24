import { FAIL, prefix, report, typeName, type Ctx } from '../core/context.ts';
import type { IssueData, MessageSpec } from '../core/issues.ts';
import { Schema, type AnySchema, type Compiled } from '../core/schema.ts';
import { findDuplicate } from '../checks/values.ts';
import type { CheckOptions } from './primitives.ts';

function messageOf(options: CheckOptions | undefined): MessageSpec | undefined {
  return typeof options === 'string' ? options : options?.message;
}

interface SizeCheck {
  min?: { n: number; exact: boolean; message: MessageSpec | undefined };
  max?: { n: number; exact: boolean; message: MessageSpec | undefined };
}

/**
 * Validates arrays: `fixed[i]` checks position `i`, `rest` checks every later item (tuples set
 * both, plain arrays only `rest`). Oversized arrays fail before their items are visited.
 */
function arrayRunner(
  fixed: readonly Compiled[],
  rest: Compiled | undefined,
  minLength: number,
  maxLength: number,
  sizes: SizeCheck,
  unique: MessageSpec | undefined | false,
  message: MessageSpec | undefined,
): { run: Compiled['run']; is: Compiled['is'] } {
  const tooSmall: IssueData | undefined = sizes.min && {
    code: 'too_small',
    origin: 'array',
    minimum: sizes.min.n,
    inclusive: true,
    ...(sizes.min.exact && { exact: true }),
  };
  const tooBig: IssueData | undefined = sizes.max && {
    code: 'too_big',
    origin: 'array',
    maximum: sizes.max.n,
    inclusive: true,
    ...(sizes.max.exact && { exact: true }),
  };

  const is = (input: unknown): boolean => {
    if (!Array.isArray(input)) return false;
    const length = input.length;
    if (length < minLength || length > maxLength) return false;
    const nFixed = fixed.length;
    for (let i = 0; i < nFixed; i++) if (!fixed[i]!.is(input[i])) return false;
    if (rest !== undefined) {
      const check = rest.is;
      for (let i = nFixed; i < length; i++) if (!check(input[i])) return false;
    }
    return unique === false || findDuplicate(input) === undefined;
  };

  const run = (input: unknown, ctx: Ctx): unknown => {
    if (!Array.isArray(input)) {
      report(ctx, { code: 'invalid_type', expected: 'array', received: typeName(input) }, message);
      return FAIL;
    }
    const length = input.length;
    let ok = true;
    if (length > maxLength) {
      // Do not walk oversized arrays: the size error is enough and walking them is a DoS vector.
      report(ctx, tooBig!, sizes.max!.message);
      return FAIL;
    }
    if (length < minLength) {
      report(ctx, tooSmall!, sizes.min!.message);
      ok = false;
      if (ctx.abort) return FAIL;
    }
    let out: unknown[] = input;
    const nFixed = fixed.length;
    // Tuples shorter than their fixed part were reported above; only existing positions are checked.
    for (let i = 0; i < length; i++) {
      const item = i < nFixed ? fixed[i]! : rest;
      if (item === undefined) break;
      const value: unknown = input[i];
      const from = ctx.issues.length;
      const result = item.run(value, ctx);
      if (result === FAIL) {
        ok = false;
        prefix(ctx, from, i);
        if (ctx.abort) return FAIL;
      } else if (result !== value) {
        if (out === input) out = input.slice();
        out[i] = result;
      }
    }
    if (ok && unique !== false) {
      const duplicate = findDuplicate(out);
      if (duplicate !== undefined) {
        report(ctx, { code: 'not_unique', indexes: duplicate }, unique);
        return FAIL;
      }
    }
    return ok ? out : FAIL;
  };

  return { run, is };
}

export class ArraySchema<T extends AnySchema> extends Schema<T['~types']['output'][], T['~types']['input'][]> {
  readonly kind = 'array';
  /** @internal */
  _sizes: SizeCheck = {};
  /** @internal */
  _unique: MessageSpec | undefined | false = false;

  constructor(
    /** The item schema. */
    readonly element: T,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }

  /** @internal */
  protected _build(): Compiled {
    const item = this.element._get();
    const min = this._sizes.min?.n ?? 0;
    const max = this._sizes.max?.n ?? Infinity;
    const { run, is } = arrayRunner([], item, min, max, this._sizes, this._unique, this._message);
    return { run, is, pure: item.pure };
  }

  private _size(which: 'min' | 'max' | 'length', n: number, options: CheckOptions | undefined): this {
    if (!Number.isInteger(n) || n < 0) throw new TypeError(`array().${which}() expects a non-negative integer`);
    const message = messageOf(options);
    const sizes: SizeCheck = { ...this._sizes };
    if (which !== 'max') sizes.min = { n, exact: which === 'length', message };
    if (which !== 'min') sizes.max = { n, exact: which === 'length', message };
    return this._with({ _sizes: sizes });
  }

  /** At least `n` items. */
  min(n: number, options?: CheckOptions): this {
    return this._size('min', n, options);
  }

  /** At most `n` items. Larger arrays are rejected without validating their items. */
  max(n: number, options?: CheckOptions): this {
    return this._size('max', n, options);
  }

  /** Exactly `n` items. */
  length(n: number, options?: CheckOptions): this {
    return this._size('length', n, options);
  }

  /** No two items may be deeply equal (JSON semantics). */
  unique(options?: CheckOptions): this {
    return this._with({ _unique: messageOf(options) });
  }
}

type TupleItems = readonly [AnySchema, ...AnySchema[]] | readonly [];

type TupleType<T extends TupleItems, IO extends 'input' | 'output'> = { -readonly [K in keyof T]: T[K]['~types'][IO] };

type WithRest<T extends unknown[], R extends AnySchema | undefined, IO extends 'input' | 'output'> = R extends AnySchema
  ? [...T, ...R['~types'][IO][]]
  : T;

export class TupleSchema<T extends TupleItems, R extends AnySchema | undefined = undefined> extends Schema<
  WithRest<TupleType<T, 'output'>, R, 'output'>,
  WithRest<TupleType<T, 'input'>, R, 'input'>
> {
  readonly kind = 'tuple';
  /** @internal */
  _rest: R | undefined;

  constructor(
    readonly items: T,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }

  /** @internal */
  protected _build(): Compiled {
    const items = this.items.map((item) => item._get());
    const rest = this._rest?._get();
    const n = items.length;
    const sizes: SizeCheck = {
      min: { n, exact: rest === undefined, message: undefined },
      ...(rest === undefined && { max: { n, exact: true, message: undefined } }),
    };
    const { run, is } = arrayRunner(items, rest, n, rest === undefined ? n : Infinity, sizes, false, this._message);
    return { run, is, pure: items.every((c) => c.pure) && (rest === undefined || rest.pure) };
  }

  /** Allows any number of extra items after the fixed ones, each validated by `schema`. */
  rest<S extends AnySchema>(schema: S): TupleSchema<T, S> {
    return this._with({ _rest: schema }) as unknown as TupleSchema<T, S>;
  }
}

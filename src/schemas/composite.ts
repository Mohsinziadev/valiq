import {
  branchCtx,
  copyObject,
  FAIL,
  hasOwn,
  prefix,
  readOwn,
  report,
  setProp,
  typeName,
  type Ctx,
} from '../core/context.ts';
import type { Issue, MessageSpec } from '../core/issues.ts';
import { fromRun, Schema, type AnySchema, type Compiled } from '../core/schema.ts';
import type { ObjectSchema } from './object.ts';
import type { EnumSchema, Literal, LiteralSchema } from './primitives.ts';

type RecordType<
  K extends AnySchema,
  V extends AnySchema,
  IO extends 'input' | 'output',
> = string extends K['~types'][IO]
  ? Record<K['~types'][IO] & PropertyKey, V['~types'][IO]>
  : Partial<Record<K['~types'][IO] & PropertyKey, V['~types'][IO]>>;

/** Objects used as dictionaries: every own key is checked by `key`, every value by `value`. */
export class RecordSchema<K extends Schema<string, string>, V extends AnySchema> extends Schema<
  RecordType<K, V, 'output'>,
  RecordType<K, V, 'input'>
> {
  readonly kind = 'record';
  constructor(
    readonly keySchema: K,
    readonly valueSchema: V,
    private readonly _message?: MessageSpec,
  ) {
    super();
  }

  /** @internal */
  protected _build(): Compiled {
    const key = this.keySchema._get();
    const value = this.valueSchema._get();
    const message = this._message;
    const isObject = (input: unknown): input is Record<string, unknown> =>
      typeof input === 'object' && input !== null && !Array.isArray(input);

    const is = (input: unknown): boolean => {
      if (!isObject(input)) return false;
      for (const k in input) {
        if (hasOwn(input, k) && (!key.is(k) || !value.is(input[k]))) return false;
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
      for (const k in input) {
        if (!hasOwn(input, k)) continue;
        if (!key.is(k)) {
          // Keys are reported as one issue whose nested issues describe the key itself.
          const keyCtx = branchCtx(ctx);
          key.run(k, keyCtx);
          ok = false;
          report(ctx, { code: 'invalid_key', path: [k], issues: keyCtx.issues });
          if (ctx.abort) return FAIL;
          continue;
        }
        const item = input[k];
        const from = ctx.issues.length;
        const result = value.run(item, ctx);
        if (result === FAIL) {
          ok = false;
          prefix(ctx, from, k);
          if (ctx.abort) return FAIL;
        } else if (result !== item) {
          if (out === input) out = copyObject(input);
          setProp(out, k, result);
        }
      }
      return ok ? out : FAIL;
    };

    return { run, is, pure: value.pure };
  }
}

type Options = readonly [AnySchema, ...AnySchema[]];

/** Finds a property whose literal values tell the object members of a union apart. */
function findDiscriminator(options: readonly AnySchema[]): { key: string; map: Map<unknown, number> } | undefined {
  if (options.length < 2 || !options.every((option) => option.kind === 'object')) return undefined;
  const shapes = options.map((option) => (option as ObjectSchema<Record<string, AnySchema>>).shape);
  candidates: for (const key of Object.keys(shapes[0]!)) {
    const map = new Map<unknown, number>();
    for (let i = 0; i < shapes.length; i++) {
      const schema = shapes[i]![key];
      // Kind checks rather than instanceof, so schemas from a second copy of valiq-js still work.
      const values =
        schema?.kind === 'literal'
          ? [(schema as LiteralSchema<Literal>).value]
          : schema?.kind === 'enum'
            ? (schema as EnumSchema<Literal>).options
            : undefined;
      if (values === undefined || schema!._refinements !== undefined) continue candidates;
      for (const value of values) {
        if (map.has(value)) continue candidates;
        map.set(value, i);
      }
    }
    return { key, map };
  }
  return undefined;
}

/** True when a member rejected the value on its type alone, so its issues are not informative. */
function rejectedByType(issues: readonly Issue[]): boolean {
  return issues.length === 1 && issues[0]!.path.length === 0 && issues[0]!.code === 'invalid_type';
}

/**
 * Reports a union where no member matched. When exactly one member got past its type check, its
 * issues are the useful ones and are reported directly; when all failed on type alone, a single
 * `invalid_type` lists the expected types; otherwise an `invalid_union` carries every branch.
 */
export function reportUnionFailure(
  ctx: Ctx,
  branches: Issue[][],
  input: unknown,
  message: MessageSpec | undefined,
  extra?: { keyword: string; schemaPath: string },
): void {
  if (ctx.silent) {
    ctx.abort = true;
    return;
  }
  if (message === undefined) {
    const informative = branches.filter((issues) => !rejectedByType(issues));
    if (informative.length === 1) {
      for (const issue of informative[0]!) {
        ctx.issues.push(issue);
        if (ctx.issues.length >= ctx.maxIssues) break;
      }
      if (ctx.abortEarly || ctx.issues.length >= ctx.maxIssues) ctx.abort = true;
      return;
    }
    if (informative.length === 0 && branches.length > 0) {
      const expected = [...new Set(branches.map((issues) => (issues[0] as { expected: string }).expected))];
      report(ctx, { code: 'invalid_type', expected: expected.join(' | '), received: typeName(input), ...extra });
      return;
    }
  }
  report(ctx, { code: 'invalid_union', branches, ...extra }, message);
}

/**
 * Accepts a value matching any member; the output comes from the first match. Object members that
 * share a literal property (e.g. `type`) are detected automatically and dispatched in O(1), with
 * issues from the selected member only.
 */
export class UnionSchema<T extends Options> extends Schema<
  T[number]['~types']['output'],
  T[number]['~types']['input']
> {
  readonly kind = 'union';
  constructor(
    readonly options: T,
    private readonly _message?: MessageSpec,
  ) {
    super();
    if (options.length === 0) throw new TypeError('union() expects at least one schema');
  }

  /** The property used to select a member, when one was detected. */
  get discriminator(): string | undefined {
    return findDiscriminator(this.options)?.key;
  }

  /** @internal */
  protected _build(): Compiled {
    const members = this.options.map((option) => option._get());
    const message = this._message;
    const pure = members.every((member) => member.pure);
    const found = findDiscriminator(this.options);

    if (found !== undefined) {
      const { key, map } = found;
      const values = [...map.keys()];
      const select = (input: unknown): Compiled | undefined =>
        typeof input === 'object' && input !== null && !Array.isArray(input)
          ? members[map.get(readOwn(input, key)) ?? -1]
          : undefined;
      return {
        is: (input) => select(input)?.is(input) === true,
        run: (input, ctx) => {
          const member = select(input);
          if (member !== undefined) return member.run(input, ctx);
          if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            report(ctx, { code: 'invalid_type', expected: 'object', received: typeName(input) }, message);
          } else {
            report(ctx, { code: 'invalid_value', path: [key], values }, message);
          }
          return FAIL;
        },
        pure,
      };
    }

    const checks = members.map((member) => member.is);
    return {
      is: (input) => {
        for (const check of checks) if (check(input)) return true;
        return false;
      },
      run: (input, ctx) => {
        const branches: Issue[][] = [];
        for (const member of members) {
          if (member.pure) {
            if (member.is(input)) return input;
            if (ctx.silent) continue;
          }
          const sub = branchCtx(ctx);
          const result = member.run(input, sub);
          if (result !== FAIL) return result;
          branches.push(sub.issues);
        }
        reportUnionFailure(ctx, branches, input, message);
        return FAIL;
      },
      pure,
    };
  }
}

type Intersect<T extends readonly AnySchema[], IO extends 'input' | 'output'> = T extends readonly [
  infer H extends AnySchema,
  ...infer R extends AnySchema[],
]
  ? H['~types'][IO] & Intersect<R, IO>
  : unknown;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts values matching every member. When members transform an object, the properties each
 * one changed are merged into a copy of the input (later members win); for other values the first
 * changed output is returned.
 */
export class IntersectionSchema<T extends Options> extends Schema<Intersect<T, 'output'>, Intersect<T, 'input'>> {
  readonly kind = 'intersection';
  constructor(readonly members: T) {
    super();
  }

  /** @internal */
  protected _build(): Compiled {
    const members = this.members.map((member) => member._get());
    const pure = members.every((member) => member.pure);
    const run = (input: unknown, ctx: Ctx): unknown => {
      let ok = true;
      let out: unknown = input;
      for (const member of members) {
        const result = member.run(input, ctx);
        if (result === FAIL) {
          ok = false;
          if (ctx.abort) return FAIL;
        } else if (result !== input) {
          if (isPlainObject(input) && isPlainObject(result)) {
            if (out === input) out = copyObject(input);
            for (const key in result) {
              if (hasOwn(result, key) && (!hasOwn(input, key) || result[key] !== input[key])) {
                setProp(out as Record<string, unknown>, key, result[key]);
              }
            }
          } else if (out === input) {
            out = result;
          }
        }
      }
      return ok ? out : FAIL;
    };
    if (!pure) return fromRun(run);
    return {
      run,
      is: (input) => {
        for (const member of members) if (!member.is(input)) return false;
        return true;
      },
      pure,
    };
  }
}

/** A schema resolved on first use, for recursive types. Annotate the variable's type explicitly. */
export class LazySchema<T extends AnySchema> extends Schema<T['~types']['output'], T['~types']['input']> {
  readonly kind = 'lazy';
  private _resolved: T | undefined;
  constructor(private readonly _getter: () => T) {
    super();
  }

  /** The schema returned by the getter. */
  get schema(): T {
    return (this._resolved ??= this._getter());
  }

  /** @internal */
  protected _build(): Compiled {
    let inner: Compiled | undefined;
    const resolve = () => (inner ??= this.schema._get());
    let depth = 0;
    return {
      run: (input, ctx) => {
        if (ctx.depth >= ctx.maxDepth) {
          report(ctx, { code: 'too_deep', maxDepth: ctx.maxDepth });
          return FAIL;
        }
        ctx.depth++;
        try {
          return resolve().run(input, ctx);
        } finally {
          ctx.depth--;
        }
      },
      is: (input) => {
        if (depth >= LAZY_IS_MAX_DEPTH) return false;
        depth++;
        try {
          return resolve().is(input);
        } finally {
          depth--;
        }
      },
      // Unknown until resolved, so assume the worst; this only affects refinement fast paths.
      pure: false,
    };
  }
}

const LAZY_IS_MAX_DEPTH = 512;

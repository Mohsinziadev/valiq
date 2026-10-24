import { defaultMessage, type Issue, type IssueData, type MessageSpec, type PathKey } from './issues.ts';

/** Options accepted by `parse`, `safeParse` and the Standard Schema `validate`. */
export interface ParseOptions {
  /** Stop at the first issue instead of collecting all of them. Default `false`. */
  abortEarly?: boolean;
  /** Stop after this many issues. Default `100`. Protects against huge invalid payloads. */
  maxIssues?: number;
  /** Maximum nesting of recursive schemas (`v.lazy`, JSON Schema `$ref`). Default `512`. */
  maxDepth?: number;
  /**
   * Overrides default messages, e.g. for localisation. Called for every issue that has no
   * per-check custom message; return `undefined` to keep the default.
   */
  messages?: (issue: Issue) => string | undefined;
}

export const DEFAULT_MAX_ISSUES = 100;
export const DEFAULT_MAX_DEPTH = 512;

/** Returned by compiled validators to signal failure. Never escapes the library. */
export const FAIL = Symbol('valiq.fail');
export type Fail = typeof FAIL;

/** Mutable state for a single validation run. */
export interface Ctx {
  issues: Issue[];
  abort: boolean;
  /** Silent contexts only need a yes/no answer: they record nothing and stop at the first failure. */
  readonly silent: boolean;
  readonly abortEarly: boolean;
  readonly maxIssues: number;
  readonly maxDepth: number;
  readonly messages: ParseOptions['messages'];
  depth: number;
  /** Reusable silent child, see `quiet()`. */
  child?: Ctx;
}

/**
 * A silent context for a yes/no sub-check (JSON Schema `not`, `if`, `contains`...). Reused across
 * calls: callers must not rely on its `abort` flag after the check returns.
 */
export function quiet(ctx: Ctx): Ctx {
  const q = ctx.silent ? ctx : (ctx.child ??= createCtx({ maxDepth: ctx.maxDepth }, true));
  q.depth = ctx.depth;
  return q;
}

/** Runs a yes/no sub-check without recording issues. */
export function passes(check: (value: unknown, ctx: Ctx) => boolean, value: unknown, ctx: Ctx): boolean {
  const q = quiet(ctx);
  const ok = check(value, q);
  q.abort = false;
  return ok;
}

export function createCtx(options?: ParseOptions, silent = false): Ctx {
  return {
    issues: [],
    abort: false,
    silent,
    abortEarly: options?.abortEarly === true,
    maxIssues: Math.max(1, options?.maxIssues ?? DEFAULT_MAX_ISSUES),
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
    messages: options?.messages,
    depth: 0,
  };
}

/** A fresh issue list sharing the parent's options and depth, used to evaluate union members. */
export function branchCtx(parent: Ctx): Ctx {
  return {
    issues: [],
    abort: false,
    silent: parent.silent,
    abortEarly: parent.abortEarly,
    maxIssues: parent.maxIssues,
    maxDepth: parent.maxDepth,
    messages: parent.messages,
    depth: parent.depth,
  };
}

/** A silent context for boolean checks. */
export function silentCtx(): Ctx {
  return createCtx(undefined, true);
}

/** Records an issue. In silent mode it only flags the failure. */
export function report(ctx: Ctx, data: IssueData, message?: MessageSpec): void {
  if (ctx.silent) {
    ctx.abort = true;
    return;
  }
  const issue = Object.assign({ code: data.code, path: [] as PathKey[], message: '' }, data) as Issue;
  issue.message = defaultMessage(issue);
  const custom = message === undefined ? undefined : typeof message === 'string' ? message : message(issue);
  const resolved = custom ?? ctx.messages?.(issue);
  if (resolved !== undefined) issue.message = resolved;
  ctx.issues.push(issue);
  if (ctx.abortEarly || ctx.issues.length >= ctx.maxIssues) ctx.abort = true;
}

function addKey(issue: Issue, key: PathKey): void {
  issue.path.unshift(key);
  if (issue.code === 'invalid_union') {
    for (const branch of issue.branches) for (const nested of branch) addKey(nested, key);
  }
}

/** Prepends `key` to the paths of all issues recorded since index `from`. */
export function prefix(ctx: Ctx, from: number, key: PathKey): void {
  const issues = ctx.issues;
  for (let i = from; i < issues.length; i++) addKey(issues[i]!, key);
}

/** A short type name for messages. Never reveals the value itself. */
export function typeName(value: unknown): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    return Number.isFinite(value) ? 'number' : 'Infinity';
  }
  if (type === 'object') {
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'Date';
    return 'object';
  }
  return type;
}

const hop = Object.prototype.hasOwnProperty;

export function hasOwn(object: object, key: PropertyKey): boolean {
  return hop.call(object, key);
}

/** Assigns a property without triggering the `__proto__` setter. */
export function setProp(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

/** A shallow copy of the own enumerable string-keyed properties of `source`, as a plain object. */
export function copyObject(source: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key in source) {
    if (hasOwn(source, key)) setProp(out, key, (source as Record<string, unknown>)[key]);
  }
  return out;
}

/** Reads an own property; inherited values (including polluted prototypes) read as `undefined`. */
export function readOwn(source: object, key: string): unknown {
  const value = (source as Record<string, unknown>)[key];
  return value !== undefined && !hasOwn(source, key) ? undefined : value;
}

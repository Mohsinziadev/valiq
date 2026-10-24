import { type Issue, type IssueData, type MessageSpec, type PathKey } from './issues.ts';
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
export declare const DEFAULT_MAX_ISSUES = 100;
export declare const DEFAULT_MAX_DEPTH = 512;
/** Returned by compiled validators to signal failure. Never escapes the library. */
export declare const FAIL: unique symbol;
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
export declare function quiet(ctx: Ctx): Ctx;
/** Runs a yes/no sub-check without recording issues. */
export declare function passes(check: (value: unknown, ctx: Ctx) => boolean, value: unknown, ctx: Ctx): boolean;
export declare function createCtx(options?: ParseOptions, silent?: boolean): Ctx;
/** A fresh issue list sharing the parent's options and depth, used to evaluate union members. */
export declare function branchCtx(parent: Ctx): Ctx;
/** A silent context for boolean checks. */
export declare function silentCtx(): Ctx;
/** Records an issue. In silent mode it only flags the failure. */
export declare function report(ctx: Ctx, data: IssueData, message?: MessageSpec): void;
/** Prepends `key` to the paths of all issues recorded since index `from`. */
export declare function prefix(ctx: Ctx, from: number, key: PathKey): void;
/** A short type name for messages. Never reveals the value itself. */
export declare function typeName(value: unknown): string;
export declare function hasOwn(object: object, key: PropertyKey): boolean;
/** Assigns a property without triggering the `__proto__` setter. */
export declare function setProp(target: Record<string, unknown>, key: string, value: unknown): void;
/** A shallow copy of the own enumerable string-keyed properties of `source`, as a plain object. */
export declare function copyObject(source: object): Record<string, unknown>;
/** Reads an own property; inherited values (including polluted prototypes) read as `undefined`. */
export declare function readOwn(source: object, key: string): unknown;

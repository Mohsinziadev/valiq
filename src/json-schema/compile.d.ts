import { type Ctx } from '../core/context.ts';
/** JSON Schema dialects understood by `fromJSONSchema`. */
export type Draft = '2020-12' | '2019-09' | 'draft-07';
/** A JSON Schema document: an object or a boolean. */
export type JSONSchemaDocument =
  | boolean
  | {
      readonly [keyword: string]: unknown;
    };
/** Something with a `test` method, e.g. an RE2 instance. */
export interface RegExpLike {
  test(value: string): boolean;
}
export interface JSONSchemaOptions {
  /** Dialect to use when the schema has no `$schema`. Default `"2020-12"`. */
  draft?: Draft;
  /**
   * Reject unknown keywords, unknown formats and malformed keyword values when compiling
   * (with "did you mean" hints). Default `true`. Unsupported keywords always throw.
   */
  strict?: boolean;
  /** `"assert"` (default) validates known formats; `"annotate"` ignores `format` entirely. */
  formats?: 'assert' | 'annotate';
  /** Extra or overriding formats. */
  customFormats?: Record<string, RegExp | ((value: string) => boolean)>;
  /**
   * Other schemas that `$ref` may point to, as a list (each needs an `$id`) or keyed by URI.
   * Valiq never fetches schemas over the network.
   */
  schemas?: readonly JSONSchemaDocument[] | Record<string, JSONSchemaDocument>;
  /** Builds pattern matchers, e.g. `(source) => new RE2(source, 'u')` to rule out ReDoS. */
  regExp?: (source: string) => RegExpLike;
}
/** Thrown at compile time for invalid or unsupported schemas. */
export declare class JSONSchemaError extends Error {
  /** JSON Pointer of the offending keyword or subschema. */
  readonly schemaPath: string;
  readonly name = 'JSONSchemaError';
  constructor(
    message: string,
    /** JSON Pointer of the offending keyword or subschema. */
    schemaPath: string,
  );
}
type Validate = (value: unknown, ctx: Ctx) => boolean;
/** Compiles a JSON Schema document into a validator function. */
export declare class Compiler {
  readonly draft: Draft;
  private readonly strict;
  private readonly assertFormats;
  private readonly formats;
  private readonly makeRegExp;
  private readonly resources;
  private readonly anchors;
  private readonly bases;
  private readonly paths;
  private readonly memo;
  /** Keywords of the root document are checked eagerly; registered schemas only once used. */
  private checkAll;
  constructor(root: JSONSchemaDocument, options?: JSONSchemaOptions);
  private detectDraft;
  private fail;
  private expect;
  /** Registers ids, anchors and base URIs, and checks keywords, for a schema and its subschemas. */
  private index;
  private checkKeywords;
  /** Compiles the root schema. */
  compileRoot(root: JSONSchemaDocument): Validate;
  private compile;
  private build;
  private combine;
  private ref;
  private resolve;
  private type;
  private enum;
  private numberKeywords;
  private stringKeywords;
  private regex;
  private arrayKeywords;
  private objectKeywords;
  private applicators;
}
/** Adapts a JSON Schema validator to Valiq's `run` contract. */
export declare function toRun(validate: Validate): (value: unknown, ctx: Ctx) => unknown;
export {};

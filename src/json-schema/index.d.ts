import { Schema, type Compiled } from '../core/schema.ts';
import { type JSONSchemaDocument, type JSONSchemaOptions } from './compile.ts';
import { type Ctx } from '../core/context.ts';
import type { FromSchema } from './infer.ts';
export { JSONSchemaError } from './compile.ts';
export type { Draft, JSONSchemaDocument, JSONSchemaOptions, RegExpLike } from './compile.ts';
export type { FromSchema } from './infer.ts';
export { toJSONSchema } from '../to-json-schema.ts';
export type { ToJSONSchemaOptions, JSONSchemaTarget } from '../to-json-schema.ts';
/**
 * A valiq-js schema backed by a JSON Schema document. It has the full schema API (`parse`,
 * `safeParse`, `is`, `.optional()`, `.refine()`...) and can be nested inside `v.object()`.
 */
export declare class JSONSchemaSchema<T = unknown> extends Schema<T> {
  /** The source document. */
  readonly jsonSchema: JSONSchemaDocument;
  /** The dialect used to interpret it. */
  readonly draft: string;
  readonly kind = 'json-schema';
  /** @internal */
  private readonly _validator;
  constructor(
    /** The source document. */
    jsonSchema: JSONSchemaDocument,
    /** The dialect used to interpret it. */
    draft: string,
    validate: (value: unknown, ctx: Ctx) => boolean,
  );
  /** @internal */
  protected _build(): Compiled;
  /** Declares the output type explicitly, for schemas that are not `as const` literals. Type-level only. */
  typed<U>(): JSONSchemaSchema<U>;
}
/**
 * Compiles a JSON Schema (2020-12, 2019-09 or draft-07) into a valiq-js schema. Declare the schema
 * `as const` to infer its TypeScript type. Throws `JSONSchemaError` for invalid or unsupported
 * schemas, so problems surface at startup rather than on the first request.
 */
export declare function fromJSONSchema<const S extends JSONSchemaDocument>(
  schema: S,
  options?: JSONSchemaOptions,
): JSONSchemaSchema<FromSchema<S>>;

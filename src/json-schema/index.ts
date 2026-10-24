import { Schema, type Compiled } from '../core/schema.ts';
import { Compiler, toRun, type JSONSchemaDocument, type JSONSchemaOptions } from './compile.ts';
import { silentCtx, type Ctx } from '../core/context.ts';
import type { FromSchema } from './infer.ts';

export { JSONSchemaError } from './compile.ts';
export type { Draft, JSONSchemaDocument, JSONSchemaOptions, RegExpLike } from './compile.ts';
export type { FromSchema } from './infer.ts';
export { toJSONSchema } from '../to-json-schema.ts';
export type { ToJSONSchemaOptions, JSONSchemaTarget } from '../to-json-schema.ts';

/**
 * A Valiq schema backed by a JSON Schema document. It has the full schema API (`parse`,
 * `safeParse`, `is`, `.optional()`, `.refine()`...) and can be nested inside `v.object()`.
 */
export class JSONSchemaSchema<T = unknown> extends Schema<T> {
  readonly kind = 'json-schema';
  /** @internal */
  private readonly _validator: Compiled;

  constructor(
    /** The source document. */
    readonly jsonSchema: JSONSchemaDocument,
    /** The dialect used to interpret it. */
    readonly draft: string,
    validate: (value: unknown, ctx: Ctx) => boolean,
  ) {
    super();
    this._validator = {
      run: toRun(validate),
      is: (value) => validate(value, silentCtx()),
      pure: true,
    };
  }

  /** @internal */
  protected _build(): Compiled {
    return this._validator;
  }

  /** Declares the output type explicitly, for schemas that are not `as const` literals. Type-level only. */
  typed<U>(): JSONSchemaSchema<U> {
    return this as unknown as JSONSchemaSchema<U>;
  }
}

/**
 * Compiles a JSON Schema (2020-12, 2019-09 or draft-07) into a Valiq schema. Declare the schema
 * `as const` to infer its TypeScript type. Throws `JSONSchemaError` for invalid or unsupported
 * schemas, so problems surface at startup rather than on the first request.
 */
export function fromJSONSchema<const S extends JSONSchemaDocument>(
  schema: S,
  options?: JSONSchemaOptions,
): JSONSchemaSchema<FromSchema<S>> {
  const compiler = new Compiler(schema, options);
  return new JSONSchemaSchema<FromSchema<S>>(schema, compiler.draft, compiler.compileRoot(schema));
}

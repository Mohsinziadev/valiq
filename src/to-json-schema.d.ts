import type { AnySchema } from './core/schema.ts';
/** JSON Schema dialects `toJSONSchema` can produce. */
export type JSONSchemaTarget = 'draft-2020-12' | 'draft-07';
export interface ToJSONSchemaOptions {
  /** Dialect to produce. Default `"draft-2020-12"`. */
  target?: JSONSchemaTarget;
  /**
   * Describe the data accepted (`"input"`, the default) or produced (`"output"`). They differ for
   * defaults, transforms and `.strip()`.
   */
  io?: 'input' | 'output';
  /**
   * What to do with schemas JSON Schema cannot express (dates, transforms' outputs, custom checks):
   * `"throw"` (default) or `"any"` to emit `{}`.
   */
  unrepresentable?: 'throw' | 'any';
}
type JSONObject = Record<string, unknown>;
/**
 * Converts a Valiq schema to JSON Schema. Refinements are not represented; everything else either
 * converts exactly or follows the `unrepresentable` option.
 */
export declare function toJSONSchema(schema: AnySchema, options?: ToJSONSchemaOptions): JSONObject;
export {};

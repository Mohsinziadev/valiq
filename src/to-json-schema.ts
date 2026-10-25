import type { AnySchema, DefaultSchema, PipeSchema, SchemaMeta, TransformSchema } from './core/schema.ts';
import type { ArraySchema, TupleSchema } from './schemas/array.ts';
import type { IntersectionSchema, LazySchema, RecordSchema, UnionSchema } from './schemas/composite.ts';
import type { ObjectSchema } from './schemas/object.ts';
import type { Check, EnumSchema, LiteralSchema, NumberSchema, StringSchema } from './schemas/primitives.ts';

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

interface State {
  target: JSONSchemaTarget;
  io: 'input' | 'output';
  unrepresentable: 'throw' | 'any';
  defs: Map<AnySchema, { name: string; body: JSONObject | undefined }>;
  embedded: number;
}

const DIALECTS: Record<JSONSchemaTarget, string> = {
  'draft-2020-12': 'https://json-schema.org/draft/2020-12/schema',
  'draft-07': 'http://json-schema.org/draft-07/schema#',
};

const LOCAL_TIME = '^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d{1,9})?)?$';
const LOCAL_DATE_TIME = `^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T${LOCAL_TIME.slice(1)}`;

const FORMATS: Record<string, string> = {
  email: 'email',
  url: 'uri',
  uuid: 'uuid',
  ipv4: 'ipv4',
  ipv6: 'ipv6',
  hostname: 'hostname',
  date: 'date',
  'date-time': 'date-time',
};

function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
}

/**
 * Converts a valiq-js schema to JSON Schema. Refinements are not represented; everything else either
 * converts exactly or follows the `unrepresentable` option.
 */
export function toJSONSchema(schema: AnySchema, options: ToJSONSchemaOptions = {}): JSONObject {
  const target = options.target ?? 'draft-2020-12';
  if (target !== 'draft-2020-12' && target !== 'draft-07') {
    throw new Error(`Unsupported JSON Schema target "${String(target)}". Supported: draft-2020-12, draft-07.`);
  }
  const state: State = {
    target,
    io: options.io ?? 'input',
    unrepresentable: options.unrepresentable ?? 'throw',
    defs: new Map(),
    embedded: 0,
  };
  const body = convert(schema, state);
  const root: JSONObject = { $schema: DIALECTS[target], ...body };
  if (state.defs.size > 0) {
    const defs: JSONObject = {};
    for (const { name, body: def } of state.defs.values()) defs[name] = def;
    root[target === 'draft-07' ? 'definitions' : '$defs'] = defs;
  }
  return root;
}

function unrepresentable(what: string, state: State): JSONObject {
  if (state.unrepresentable === 'any') return {};
  throw new Error(`${what} cannot be represented in JSON Schema. Pass { unrepresentable: "any" } to emit {} instead.`);
}

function withMeta(body: JSONObject, meta: SchemaMeta | undefined, state: State): JSONObject {
  if (meta === undefined) return body;
  // Documentation keywords come first, which reads better in generated documents.
  const out: JSONObject = {};
  if (meta.title !== undefined) out.title = meta.title;
  if (meta.description !== undefined) out.description = meta.description;
  if (meta.examples !== undefined) out.examples = meta.examples;
  if (meta.deprecated !== undefined) out.deprecated = meta.deprecated;
  // draft-07 ignores keywords next to $ref, so the reference moves into allOf.
  return state.target === 'draft-07' && '$ref' in body ? { ...out, allOf: [body] } : { ...out, ...body };
}

function convert(schema: AnySchema, state: State): JSONObject {
  return withMeta(convertBody(schema, state), schema._meta, state);
}

/** The checks that hold for the chosen side of any transforms (`trim`, `toLowerCase`, ...). */
function visibleChecks<T>(checks: readonly Check<T>[], io: 'input' | 'output'): readonly Check<T>[] {
  if (io === 'input') {
    const first = checks.findIndex((check) => check.map !== undefined);
    return first === -1 ? checks : checks.slice(0, first);
  }
  let last = -1;
  checks.forEach((check, i) => {
    if (check.map !== undefined) last = i;
  });
  return checks.slice(last + 1);
}

function addPattern(out: JSONObject, pattern: string): void {
  if (out.pattern === undefined) {
    out.pattern = pattern;
  } else {
    ((out.allOf ??= []) as JSONObject[]).push({ pattern });
  }
}

function convertString(schema: StringSchema, state: State): JSONObject {
  const out: JSONObject = { type: 'string' };
  for (const check of visibleChecks(schema._checks, state.io)) {
    const value = check.value;
    switch (check.name) {
      case 'min':
        out.minLength = Math.max((out.minLength as number | undefined) ?? 0, value as number);
        break;
      case 'max':
        out.maxLength = Math.min((out.maxLength as number | undefined) ?? Infinity, value as number);
        break;
      case 'regex':
        addPattern(out, (value as RegExp).source);
        break;
      case 'startsWith':
        addPattern(out, `^${escapeRegExp(value as string)}`);
        break;
      case 'endsWith':
        addPattern(out, `${escapeRegExp(value as string)}$`);
        break;
      case 'includes':
        addPattern(out, escapeRegExp(value as string));
        break;
      case 'format':
        if (value === 'time') addPattern(out, LOCAL_TIME);
        else if (value === 'local-date-time') addPattern(out, LOCAL_DATE_TIME);
        else if (out.format === undefined) out.format = FORMATS[value as string];
        else ((out.allOf ??= []) as JSONObject[]).push({ format: FORMATS[value as string] });
        break;
    }
  }
  return out;
}

function convertNumber(schema: NumberSchema, state: State): JSONObject {
  const out: JSONObject = { type: 'number' };
  for (const check of schema._checks) {
    const value = check.value as number;
    switch (check.name) {
      case 'int':
        out.type = 'integer';
        break;
      case 'min':
        out.minimum = Math.max((out.minimum as number | undefined) ?? -Infinity, value);
        break;
      case 'max':
        out.maximum = Math.min((out.maximum as number | undefined) ?? Infinity, value);
        break;
      case 'gt':
        out.exclusiveMinimum = Math.max((out.exclusiveMinimum as number | undefined) ?? -Infinity, value);
        break;
      case 'lt':
        out.exclusiveMaximum = Math.min((out.exclusiveMaximum as number | undefined) ?? Infinity, value);
        break;
      case 'multipleOf':
        if (out.multipleOf === undefined) out.multipleOf = value;
        else ((out.allOf ??= []) as JSONObject[]).push({ multipleOf: value });
        break;
    }
  }
  void state;
  return out;
}

function literalType(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return undefined;
}

/** Whether a property schema may be absent, from the chosen side of defaults. */
function isOptional(schema: AnySchema, io: 'input' | 'output'): boolean {
  if (io === 'output' && schema.kind === 'default') return false;
  return schema.is(undefined);
}

function convertObject(
  schema: ObjectSchema<Record<string, AnySchema>, AnySchema | undefined>,
  state: State,
): JSONObject {
  const properties: JSONObject = {};
  const required: string[] = [];
  for (const [key, property] of Object.entries(schema.shape)) {
    properties[key] = convert(property, state);
    if (!isOptional(property, state.io)) required.push(key);
  }
  const out: JSONObject = { type: 'object', properties };
  if (required.length > 0) out.required = required;
  if (schema._catchall !== undefined) out.additionalProperties = convert(schema._catchall, state);
  else if (schema._unknownKeys === 'strict') out.additionalProperties = false;
  else if (schema._unknownKeys === 'strip' && state.io === 'output') out.additionalProperties = false;
  return out;
}

function nullable(inner: JSONObject): JSONObject {
  const keys = Object.keys(inner);
  if (typeof inner.type === 'string' && inner.enum === undefined && inner.const === undefined && keys.length >= 1) {
    return { ...inner, type: [inner.type, 'null'] };
  }
  return { anyOf: [inner, { type: 'null' }] };
}

function convertBody(schema: AnySchema, state: State): JSONObject {
  switch (schema.kind) {
    case 'string':
      if ((schema as StringSchema)._coerce) return unrepresentable('A coerced string', state);
      return convertString(schema as StringSchema, state);
    case 'number':
    case 'boolean': {
      const coerce = (schema as NumberSchema)._coerce;
      if (coerce && state.io === 'input') return unrepresentable(`v.coerce.${schema.kind}() input`, state);
      return schema.kind === 'number' ? convertNumber(schema as NumberSchema, state) : { type: 'boolean' };
    }
    case 'null':
      return { type: 'null' };
    case 'unknown':
      return {};
    case 'never':
      return { not: {} };
    case 'undefined':
      return unrepresentable('undefined', state);
    case 'date':
      return unrepresentable('A Date', state);
    case 'instance':
      return unrepresentable('An instanceof check', state);
    case 'custom':
      return unrepresentable('v.custom()', state);
    case 'literal': {
      const value = (schema as LiteralSchema<string>).value as unknown;
      const type = literalType(value);
      if (type === undefined) return unrepresentable('An undefined literal', state);
      return { type, const: value };
    }
    case 'enum': {
      const values = (schema as EnumSchema<string>).options as readonly unknown[];
      if (values.some((value) => value === undefined)) return unrepresentable('An enum containing undefined', state);
      const types = [...new Set(values.map((value) => (typeof value === 'number' ? 'number' : literalType(value))))];
      return types.length === 1 ? { type: types[0], enum: [...values] } : { enum: [...values] };
    }
    case 'object':
      return convertObject(schema as ObjectSchema<Record<string, AnySchema>, AnySchema | undefined>, state);
    case 'array': {
      const array = schema as ArraySchema<AnySchema>;
      const out: JSONObject = { type: 'array', items: convert(array.element, state) };
      if (array._sizes.min !== undefined) out.minItems = array._sizes.min.n;
      if (array._sizes.max !== undefined) out.maxItems = array._sizes.max.n;
      if (array._unique !== false) out.uniqueItems = true;
      return out;
    }
    case 'tuple': {
      const tuple = schema as TupleSchema<readonly [AnySchema], AnySchema | undefined>;
      const items = tuple.items.map((item) => convert(item, state));
      const rest = tuple._rest === undefined ? false : convert(tuple._rest, state);
      const out: JSONObject = { type: 'array', minItems: items.length };
      if (rest === false) out.maxItems = items.length;
      if (state.target === 'draft-07') {
        out.items = items;
        out.additionalItems = rest;
      } else {
        out.prefixItems = items;
        out.items = rest;
      }
      return out;
    }
    case 'record': {
      const record = schema as RecordSchema<AnySchema & StringSchema, AnySchema>;
      const keys = convert(record.keySchema, state);
      delete keys.type;
      const out: JSONObject = { type: 'object', additionalProperties: convert(record.valueSchema, state) };
      if (Object.keys(keys).length > 0) out.propertyNames = keys;
      return out;
    }
    case 'union':
      return { anyOf: (schema as UnionSchema<readonly [AnySchema]>).options.map((option) => convert(option, state)) };
    case 'intersection':
      return {
        allOf: (schema as IntersectionSchema<readonly [AnySchema]>).members.map((member) => convert(member, state)),
      };
    case 'optional':
      return convert((schema as unknown as { inner: AnySchema }).inner, state);
    case 'nullable':
      return nullable(convert((schema as unknown as { inner: AnySchema }).inner, state));
    case 'default': {
      const wrapper = schema as DefaultSchema<AnySchema>;
      const value = wrapper._factory();
      const inner = convert(wrapper.inner, state);
      return value === undefined || typeof value === 'function' ? inner : { ...inner, default: value };
    }
    case 'transform':
      if (state.io === 'output') return unrepresentable('The output of .transform()', state);
      return convert((schema as TransformSchema<AnySchema, unknown>).inner, state);
    case 'pipe': {
      const pipe = schema as PipeSchema<AnySchema, AnySchema>;
      return convert(state.io === 'input' ? pipe.first : pipe.second, state);
    }
    case 'brand':
      return convert((schema as unknown as { inner: AnySchema }).inner, state);
    case 'lazy': {
      let def = state.defs.get(schema);
      if (def === undefined) {
        def = { name: `Schema${state.defs.size + 1}`, body: undefined };
        state.defs.set(schema, def);
        def.body = convert((schema as LazySchema<AnySchema>).schema, state);
      }
      return { $ref: `#/${state.target === 'draft-07' ? 'definitions' : '$defs'}/${def.name}` };
    }
    case 'json-schema': {
      const source = (schema as unknown as { jsonSchema: unknown }).jsonSchema;
      if (typeof source === 'boolean') return source ? {} : { not: {} };
      const copy = structuredClone(source) as JSONObject;
      delete copy.$schema;
      // Local refs inside the embedded document must keep resolving against it, so it becomes its
      // own resource. A top-level $ref moves into allOf: draft-07 ignores $ref siblings such as
      // $id, and some validators mishandle a $ref beside a nested $id.
      if (copy.$id === undefined && JSON.stringify(copy).includes('"$ref"')) {
        copy.$id = `https://valiq.invalid/embedded/${++state.embedded}.json`;
      }
      if (copy.$ref !== undefined && copy.$id !== undefined) {
        copy.allOf = [{ $ref: copy.$ref }, ...((copy.allOf as JSONObject[] | undefined) ?? [])];
        delete copy.$ref;
      }
      return copy;
    }
    default:
      return unrepresentable(`A "${schema.kind}" schema`, state);
  }
}

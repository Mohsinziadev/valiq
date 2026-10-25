import { FAIL, hasOwn, passes, prefix, report, typeName, type Ctx } from '../core/context.ts';
import type { Issue, IssueData } from '../core/issues.ts';
import { branchCtx } from '../core/context.ts';
import {
  isDate,
  isDuration,
  isHostname,
  isMailbox,
  isIPv4,
  isIPv6,
  isJSONPointer,
  isRegex,
  isRelativeJSONPointer,
  isURITemplate,
  isRFC3339DateTime,
  isRFC3339Time,
  isURI,
  isURIReference,
  isUUID,
} from '../checks/formats.ts';
import { deepEqual, findDuplicate, hasMaxLength, hasMinLength, isMultipleOf } from '../checks/values.ts';
import { reportUnionFailure } from '../schemas/composite.ts';

/** JSON Schema dialects understood by `fromJSONSchema`. */
export type Draft = '2020-12' | '2019-09' | 'draft-07';

/** A JSON Schema document: an object or a boolean. */
export type JSONSchemaDocument = boolean | { readonly [keyword: string]: unknown };

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
   * valiq-js never fetches schemas over the network.
   */
  schemas?: readonly JSONSchemaDocument[] | Record<string, JSONSchemaDocument>;
  /** Builds pattern matchers, e.g. `(source) => new RE2(source, 'u')` to rule out ReDoS. */
  regExp?: (source: string) => RegExpLike;
}

/** Thrown at compile time for invalid or unsupported schemas. */
export class JSONSchemaError extends Error {
  override readonly name = 'JSONSchemaError';
  constructor(
    message: string,
    /** JSON Pointer of the offending keyword or subschema. */
    readonly schemaPath: string,
  ) {
    super(`${message} (at ${schemaPath})`);
  }
}

type Validate = (value: unknown, ctx: Ctx) => boolean;
type JSONObject = { readonly [keyword: string]: unknown };

const DEFAULT_BASE = 'valiq://root/schema.json';

const DIALECTS: Record<string, Draft> = {
  'https://json-schema.org/draft/2020-12/schema': '2020-12',
  'https://json-schema.org/draft/2019-09/schema': '2019-09',
  'http://json-schema.org/draft-07/schema': 'draft-07',
  'http://json-schema.org/draft-06/schema': 'draft-07',
};

const UNSUPPORTED: Record<string, string> = {
  unevaluatedProperties: 'unevaluatedProperties is not supported yet; use additionalProperties where possible',
  unevaluatedItems: 'unevaluatedItems is not supported yet; use items/prefixItems where possible',
  $dynamicRef: '$dynamicRef is not supported yet; use $ref',
  $recursiveRef: '$recursiveRef is not supported yet; use $ref',
};

const COMMON = [
  '$schema',
  '$id',
  '$ref',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'readOnly',
  'writeOnly',
  'type',
  'enum',
  'const',
  'multipleOf',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'format',
  'items',
  'maxItems',
  'minItems',
  'uniqueItems',
  'contains',
  'maxProperties',
  'minProperties',
  'required',
  'properties',
  'patternProperties',
  'additionalProperties',
  'propertyNames',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'contentMediaType',
  'contentEncoding',
  'definitions',
];
const MODERN = [
  '$defs',
  '$anchor',
  '$vocabulary',
  'deprecated',
  'dependentRequired',
  'dependentSchemas',
  'maxContains',
  'minContains',
  'contentSchema',
];
const KEYWORDS: Record<Draft, ReadonlySet<string>> = {
  'draft-07': new Set([...COMMON, 'dependencies', 'additionalItems']),
  '2019-09': new Set([...COMMON, ...MODERN, 'additionalItems', '$recursiveAnchor']),
  '2020-12': new Set([...COMMON, ...MODERN, 'prefixItems', '$dynamicAnchor']),
};

const TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);

const FORMATS: Record<string, (value: string) => boolean> = {
  date: isDate,
  time: isRFC3339Time,
  'date-time': isRFC3339DateTime,
  duration: isDuration,
  email: isMailbox,
  hostname: isHostname,
  ipv4: isIPv4,
  ipv6: isIPv6,
  uri: isURI,
  'uri-reference': isURIReference,
  uuid: isUUID,
  regex: isRegex,
  'json-pointer': isJSONPointer,
  'relative-json-pointer': isRelativeJSONPointer,
  'uri-template': isURITemplate,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function escapePointer(key: string | number): string {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

function closest(word: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score = distance(word.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

function resolveUri(reference: string, base: string, path: string): string {
  try {
    return new URL(reference, base).href;
  } catch {
    throw new JSONSchemaError(`Invalid URI reference "${reference}"`, path);
  }
}

function stripFragment(uri: string): string {
  const hash = uri.indexOf('#');
  return hash === -1 ? uri : uri.slice(0, hash);
}

/** Compiles a JSON Schema document into a validator function. */
export class Compiler {
  readonly draft: Draft;
  private readonly strict: boolean;
  private readonly assertFormats: boolean;
  private readonly formats: Record<string, (value: string) => boolean>;
  private readonly makeRegExp: (source: string) => RegExpLike;
  private readonly resources = new Map<string, unknown>();
  private readonly anchors = new Map<string, unknown>();
  private readonly bases = new WeakMap<object, string>();
  private readonly paths = new WeakMap<object, string>();
  private readonly memo = new Map<object, Validate>();
  /** Keywords of the root document are checked eagerly; registered schemas only once used. */
  private checkAll = false;

  constructor(root: JSONSchemaDocument, options: JSONSchemaOptions = {}) {
    this.strict = options.strict !== false;
    this.draft = this.detectDraft(root, options.draft);
    this.assertFormats = options.formats !== 'annotate';
    this.formats = { ...FORMATS };
    for (const [name, format] of Object.entries(options.customFormats ?? {})) {
      this.formats[name] = format instanceof RegExp ? (value) => format.test(value) : format;
    }
    const custom = options.regExp;
    this.makeRegExp =
      custom ??
      ((source) => {
        try {
          return new RegExp(source, 'u');
        } catch {
          return new RegExp(source); // Patterns written for non-Unicode mode, e.g. `\-` outside a class.
        }
      });

    const extra = options.schemas ?? [];
    const entries: [string | undefined, JSONSchemaDocument][] = Array.isArray(extra)
      ? extra.map((schema) => [undefined, schema])
      : Object.entries(extra);
    for (const [uri, schema] of entries) {
      const id = isObject(schema) && typeof schema.$id === 'string' ? schema.$id : uri;
      if (id === undefined) throw new JSONSchemaError('Schemas passed in "schemas" need an $id', '#');
      const base = stripFragment(resolveUri(id, DEFAULT_BASE, '#'));
      this.resources.set(base, schema);
      if (uri !== undefined) this.resources.set(stripFragment(resolveUri(uri, DEFAULT_BASE, '#')), schema);
      this.index(schema, base, `${base}#`);
    }
    this.resources.set(DEFAULT_BASE, root);
    this.checkAll = true;
    this.index(root, DEFAULT_BASE, '#');
  }

  private detectDraft(root: JSONSchemaDocument, fallback: Draft | undefined): Draft {
    if (fallback !== undefined) return fallback;
    if (!isObject(root) || root.$schema === undefined) return '2020-12';
    if (typeof root.$schema !== 'string') throw new JSONSchemaError('$schema must be a string', '#/$schema');
    const uri = root.$schema.replace(/#$/, '');
    const draft =
      DIALECTS[uri] ?? DIALECTS[uri.replace(/^http:/, 'https:')] ?? DIALECTS[uri.replace(/^https:/, 'http:')];
    if (draft !== undefined) return draft;
    if (/draft-0[34]/.test(uri)) {
      throw new JSONSchemaError('Draft-04 and older are not supported; use draft-07 or later', '#/$schema');
    }
    if (this.strict)
      throw new JSONSchemaError(`Unknown $schema "${root.$schema}"; pass the "draft" option`, '#/$schema');
    return '2020-12';
  }

  private fail(message: string, path: string): never {
    throw new JSONSchemaError(message, path);
  }

  private expect(condition: boolean, message: string, path: string): void {
    if (!condition) this.fail(message, path);
  }

  /** Registers ids, anchors and base URIs, and checks keywords, for a schema and its subschemas. */
  private index(node: unknown, base: string, path: string): void {
    if (typeof node === 'boolean') return;
    if (!isObject(node)) this.fail('A schema must be an object or a boolean', path);
    if (this.paths.has(node)) return;
    const draft07 = this.draft === 'draft-07';
    const refOnly = draft07 && node.$ref !== undefined;
    let current = base;
    if (node.$id !== undefined && !refOnly) {
      this.expect(typeof node.$id === 'string', '$id must be a string', `${path}/$id`);
      const id = node.$id as string;
      if (draft07 && id.startsWith('#')) {
        this.anchors.set(`${stripFragment(base)}${id}`, node);
      } else {
        current = stripFragment(resolveUri(id, base, `${path}/$id`));
        if (!this.resources.has(current)) this.resources.set(current, node);
      }
    }
    for (const keyword of ['$anchor', '$dynamicAnchor'] as const) {
      const anchor = node[keyword];
      if (anchor === undefined || draft07) continue;
      this.expect(
        typeof anchor === 'string' && /^[A-Za-z_][\w.-]*$/.test(anchor),
        `${keyword} must be a plain name`,
        `${path}/${keyword}`,
      );
      this.anchors.set(`${current}#${anchor as string}`, node);
    }
    this.bases.set(node, current);
    this.paths.set(node, path);
    if (this.checkAll) this.checkKeywords(node, path);

    const sub = (schema: unknown, at: string) => this.index(schema, current, at);
    const map = (keyword: string) => {
      const value = node[keyword];
      if (value === undefined) return;
      this.expect(isObject(value), `${keyword} must be an object of schemas`, `${path}/${keyword}`);
      for (const [key, schema] of Object.entries(value as object))
        sub(schema, `${path}/${keyword}/${escapePointer(key)}`);
    };
    const list = (keyword: string) => {
      const value = node[keyword];
      if (value === undefined) return;
      this.expect(
        Array.isArray(value) && value.length > 0,
        `${keyword} must be a non-empty array of schemas`,
        `${path}/${keyword}`,
      );
      (value as unknown[]).forEach((schema, i) => sub(schema, `${path}/${keyword}/${i}`));
    };
    const single = (keyword: string) => {
      if (node[keyword] !== undefined) sub(node[keyword], `${path}/${keyword}`);
    };

    map('properties');
    map('patternProperties');
    map('$defs');
    map('definitions');
    map('dependentSchemas');
    if (isObject(node.dependencies)) {
      for (const [key, value] of Object.entries(node.dependencies)) {
        if (!Array.isArray(value)) sub(value, `${path}/dependencies/${escapePointer(key)}`);
      }
    }
    list('allOf');
    list('anyOf');
    list('oneOf');
    list('prefixItems');
    if (Array.isArray(node.items)) list('items');
    else single('items');
    for (const keyword of [
      'additionalItems',
      'additionalProperties',
      'contains',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
      'contentSchema',
    ]) {
      single(keyword);
    }
  }

  private checkKeywords(node: JSONObject, path: string): void {
    const known = KEYWORDS[this.draft];
    for (const keyword of Object.keys(node)) {
      const unsupported = UNSUPPORTED[keyword];
      if (unsupported !== undefined) this.fail(unsupported, `${path}/${keyword}`);
      if (keyword === '$recursiveAnchor' && node[keyword] === true) {
        this.fail('$recursiveAnchor is not supported yet', `${path}/${keyword}`);
      }
      if (!this.strict || known.has(keyword) || keyword.startsWith('x-')) continue;
      if (keyword === 'nullable') {
        this.fail('"nullable" is OpenAPI 3.0 syntax; use "type": ["<type>", "null"] instead', `${path}/${keyword}`);
      }
      const hint = closest(keyword, known);
      this.fail(
        `Unknown keyword "${keyword}"${hint ? ` (did you mean "${hint}"?)` : ''}; pass { strict: false } to ignore unknown keywords`,
        `${path}/${keyword}`,
      );
    }
  }

  /** Compiles the root schema. */
  compileRoot(root: JSONSchemaDocument): Validate {
    return this.compile(root, '#');
  }

  private compile(node: unknown, path: string): Validate {
    if (node === true) return () => true;
    if (node === false) {
      return (_value, ctx) => {
        report(ctx, { code: 'forbidden', keyword: 'false', schemaPath: path });
        return false;
      };
    }
    const schema = node as JSONObject;
    const cached = this.memo.get(schema);
    if (cached !== undefined) return cached;
    // Placeholder for recursive references reached while this schema is being compiled.
    const cell: { validate?: Validate } = {};
    this.memo.set(schema, (value, ctx) => cell.validate!(value, ctx));
    const validate = this.build(schema, this.paths.get(schema) ?? path);
    cell.validate = validate;
    this.memo.set(schema, validate);
    return validate;
  }

  private build(node: JSONObject, path: string): Validate {
    this.checkKeywords(node, path);
    const draft07 = this.draft === 'draft-07';
    const checks: Validate[] = [];
    const strings: Validate[] = [];
    const numbers: Validate[] = [];
    const objects: Validate[] = [];
    const arrays: Validate[] = [];
    const at = (keyword: string) => `${path}/${keyword}`;

    if (node.$ref !== undefined) {
      checks.push(this.ref(node, path));
      if (draft07) return this.combine(checks, strings, numbers, objects, arrays);
    }
    if (node.type !== undefined) checks.push(this.type(node.type, at('type')));
    if (node.enum !== undefined) checks.push(this.enum(node.enum, at('enum')));
    if (node.const !== undefined) {
      const expected = node.const;
      const issue: IssueData = { code: 'invalid_value', values: [expected], keyword: 'const', schemaPath: at('const') };
      checks.push((value, ctx) => {
        if (deepEqual(value, expected)) return true;
        report(ctx, issue);
        return false;
      });
    }
    this.numberKeywords(node, path, numbers);
    this.stringKeywords(node, path, strings);
    this.arrayKeywords(node, path, arrays);
    this.objectKeywords(node, path, objects);
    this.applicators(node, path, checks);
    return this.combine(checks, strings, numbers, objects, arrays);
  }

  private combine(
    checks: Validate[],
    strings: Validate[],
    numbers: Validate[],
    objects: Validate[],
    arrays: Validate[],
  ): Validate {
    const all = (list: Validate[]): Validate | undefined => {
      if (list.length === 0) return undefined;
      if (list.length === 1) return list[0];
      return (value, ctx) => {
        let ok = true;
        for (const check of list) {
          if (!check(value, ctx)) {
            ok = false;
            if (ctx.abort) return false;
          }
        }
        return ok;
      };
    };
    const any = all(checks);
    const string = all(strings);
    const number = all(numbers);
    const object = all(objects);
    const array = all(arrays);
    if (string === undefined && number === undefined && object === undefined && array === undefined) {
      return any ?? (() => true);
    }
    return (value, ctx) => {
      let ok = true;
      if (any !== undefined && !any(value, ctx)) {
        ok = false;
        if (ctx.abort) return false;
      }
      let typed: Validate | undefined;
      switch (typeof value) {
        case 'string':
          typed = string;
          break;
        case 'number':
          typed = number;
          break;
        case 'object':
          typed = value === null ? undefined : Array.isArray(value) ? array : object;
          break;
      }
      if (typed !== undefined && !typed(value, ctx)) ok = false;
      return ok;
    };
  }

  private ref(node: JSONObject, path: string): Validate {
    const reference = node.$ref;
    this.expect(typeof reference === 'string', '$ref must be a string', `${path}/$ref`);
    const base = this.bases.get(node) ?? DEFAULT_BASE;
    const resolved = this.resolve(reference as string, base, `${path}/$ref`);
    const validate = this.compile(resolved.node, resolved.path);
    return (value, ctx) => {
      if (ctx.depth >= ctx.maxDepth) {
        report(ctx, { code: 'too_deep', maxDepth: ctx.maxDepth, keyword: '$ref', schemaPath: `${path}/$ref` });
        return false;
      }
      ctx.depth++;
      try {
        return validate(value, ctx);
      } finally {
        ctx.depth--;
      }
    };
  }

  private resolve(reference: string, base: string, path: string): { node: unknown; path: string } {
    const full = resolveUri(reference, base, path);
    const hash = full.indexOf('#');
    const document = hash === -1 ? full : full.slice(0, hash);
    const fragment = hash === -1 ? '' : full.slice(hash + 1);
    const missing = () =>
      this.fail(
        `Cannot resolve $ref "${reference}"${document === stripFragment(DEFAULT_BASE) || this.resources.has(document) ? '' : '; pass the referenced schema in the "schemas" option'}`,
        path,
      );
    if (fragment !== '' && !fragment.startsWith('/')) {
      let anchor: string;
      try {
        anchor = decodeURIComponent(fragment);
      } catch {
        return missing();
      }
      const node = this.anchors.get(`${document}#${anchor}`);
      if (node === undefined) return missing();
      return { node, path: this.paths.get(node as object) ?? path };
    }
    const root = this.resources.get(document);
    if (root === undefined) return missing();
    let node: unknown = root;
    let nodeBase = this.bases.get(root as object) ?? document;
    let pointer = this.paths.get(root as object) ?? '#';
    if (fragment !== '') {
      let decoded: string;
      try {
        decoded = decodeURIComponent(fragment);
      } catch {
        return missing();
      }
      for (const raw of decoded.slice(1).split('/')) {
        const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
        if (Array.isArray(node) && /^(0|[1-9]\d*)$/.test(key) && Number(key) < node.length) node = node[Number(key)];
        else if (isObject(node) && hasOwn(node, key)) node = node[key];
        else return missing();
        if (isObject(node) && this.bases.has(node)) nodeBase = this.bases.get(node)!;
        pointer = `${pointer}/${escapePointer(key)}`;
      }
    }
    if (isObject(node) && !this.paths.has(node)) this.index(node, nodeBase, pointer);
    return { node, path: (isObject(node) && this.paths.get(node)) || pointer };
  }

  private type(type: unknown, path: string): Validate {
    const types = Array.isArray(type) ? type : [type];
    this.expect(
      types.length > 0 && types.every((t) => typeof t === 'string' && TYPES.has(t)),
      'type must be a type name or a non-empty array of type names',
      path,
    );
    const names = types as string[];
    const expected = names.join(' | ');
    const fail = (value: unknown, ctx: Ctx) => {
      report(ctx, { code: 'invalid_type', expected, received: typeName(value), keyword: 'type', schemaPath: path });
      return false;
    };
    if (names.length === 1) {
      const only = names[0]!;
      return (value, ctx) => typeMatches(only, value) || fail(value, ctx);
    }
    return (value, ctx) => {
      for (const name of names) if (typeMatches(name, value)) return true;
      return fail(value, ctx);
    };
  }

  private enum(values: unknown, path: string): Validate {
    this.expect(Array.isArray(values), 'enum must be an array', path);
    const list = values as unknown[];
    const primitives = new Set(list.filter((value) => typeof value !== 'object' || value === null));
    const objects = list.filter((value) => typeof value === 'object' && value !== null);
    const issue: IssueData = { code: 'invalid_value', values: list, keyword: 'enum', schemaPath: path };
    return (value, ctx) => {
      if (typeof value !== 'object' || value === null) {
        if (primitives.has(value)) return true;
      } else {
        for (const option of objects) if (deepEqual(value, option)) return true;
      }
      report(ctx, issue);
      return false;
    };
  }

  private numberKeywords(node: JSONObject, path: string, out: Validate[]): void {
    const bound = (
      keyword: 'minimum' | 'maximum' | 'exclusiveMinimum' | 'exclusiveMaximum',
      test: (value: number, limit: number) => boolean,
      issue: (limit: number) => IssueData,
    ) => {
      const limit = node[keyword];
      if (limit === undefined) return;
      if (typeof limit === 'boolean') {
        this.fail(`Boolean ${keyword} is draft-04 syntax; use a number`, `${path}/${keyword}`);
      }
      this.expect(
        typeof limit === 'number' && Number.isFinite(limit),
        `${keyword} must be a number`,
        `${path}/${keyword}`,
      );
      const data = { ...issue(limit as number), keyword, schemaPath: `${path}/${keyword}` } as IssueData;
      out.push((value, ctx) => {
        if (test(value as number, limit as number)) return true;
        report(ctx, data);
        return false;
      });
    };
    bound(
      'minimum',
      (v, l) => v >= l,
      (l) => ({ code: 'too_small', origin: 'number', minimum: l, inclusive: true }),
    );
    bound(
      'maximum',
      (v, l) => v <= l,
      (l) => ({ code: 'too_big', origin: 'number', maximum: l, inclusive: true }),
    );
    bound(
      'exclusiveMinimum',
      (v, l) => v > l,
      (l) => ({ code: 'too_small', origin: 'number', minimum: l, inclusive: false }),
    );
    bound(
      'exclusiveMaximum',
      (v, l) => v < l,
      (l) => ({ code: 'too_big', origin: 'number', maximum: l, inclusive: false }),
    );
    const divisor = node.multipleOf;
    if (divisor !== undefined) {
      this.expect(
        typeof divisor === 'number' && divisor > 0 && Number.isFinite(divisor),
        'multipleOf must be a positive number',
        `${path}/multipleOf`,
      );
      const d = divisor as number;
      const issue: IssueData = {
        code: 'not_multiple_of',
        divisor: d,
        keyword: 'multipleOf',
        schemaPath: `${path}/multipleOf`,
      };
      out.push((value, ctx) => {
        if (isMultipleOf(value as number, d)) return true;
        report(ctx, issue);
        return false;
      });
    }
  }

  private stringKeywords(node: JSONObject, path: string, target: Validate[]): void {
    const out: Validate[] = [];
    const size = (keyword: 'minLength' | 'maxLength') => {
      const n = node[keyword];
      if (n === undefined) return;
      this.expect(isNonNegativeInteger(n), `${keyword} must be a non-negative integer`, `${path}/${keyword}`);
      const limit = n as number;
      const min = keyword === 'minLength';
      const issue: IssueData = min
        ? {
            code: 'too_small',
            origin: 'string',
            minimum: limit,
            inclusive: true,
            keyword,
            schemaPath: `${path}/${keyword}`,
          }
        : {
            code: 'too_big',
            origin: 'string',
            maximum: limit,
            inclusive: true,
            keyword,
            schemaPath: `${path}/${keyword}`,
          };
      out.push((value, ctx) => {
        if (min ? hasMinLength(value as string, limit) : hasMaxLength(value as string, limit)) return true;
        report(ctx, issue);
        return false;
      });
    };
    size('minLength');

    if (node.pattern !== undefined) {
      this.expect(typeof node.pattern === 'string', 'pattern must be a string', `${path}/pattern`);
      const source = node.pattern as string;
      const re = this.regex(source, `${path}/pattern`);
      const issue: IssueData = {
        code: 'invalid_pattern',
        pattern: source,
        keyword: 'pattern',
        schemaPath: `${path}/pattern`,
      };
      out.push((value, ctx) => {
        if (re.test(value as string)) return true;
        report(ctx, issue);
        return false;
      });
    }

    if (node.format !== undefined && this.assertFormats) {
      this.expect(typeof node.format === 'string', 'format must be a string', `${path}/format`);
      const name = node.format as string;
      const test = this.formats[name];
      if (test === undefined) {
        if (this.strict) {
          this.fail(
            `Unknown format "${name}"; register it with customFormats, or pass { formats: "annotate" } or { strict: false }`,
            `${path}/format`,
          );
        }
        return;
      }
      const issue: IssueData = {
        code: 'invalid_format',
        format: name,
        keyword: 'format',
        schemaPath: `${path}/format`,
      };
      out.push((value, ctx) => {
        if (test(value as string)) return true;
        report(ctx, issue);
        return false;
      });
    }

    const rest = this.combine(out, [], [], [], []);
    const max = node.maxLength;
    if (max === undefined) {
      if (out.length > 0) target.push(rest);
      return;
    }
    this.expect(isNonNegativeInteger(max), 'maxLength must be a non-negative integer', `${path}/maxLength`);
    // Over-long strings fail on maxLength alone; patterns and formats never see them.
    const issue: IssueData = {
      code: 'too_big',
      origin: 'string',
      maximum: max as number,
      inclusive: true,
      keyword: 'maxLength',
      schemaPath: `${path}/maxLength`,
    };
    target.push((value, ctx) => {
      if (!hasMaxLength(value as string, max as number)) {
        report(ctx, issue);
        return false;
      }
      return out.length === 0 || rest(value, ctx);
    });
  }

  private regex(source: string, path: string): RegExpLike {
    try {
      return this.makeRegExp(source);
    } catch (error) {
      return this.fail(`Invalid pattern: ${(error as Error).message}`, path);
    }
  }

  private arrayKeywords(node: JSONObject, path: string, target: Validate[]): void {
    const out: Validate[] = [];
    const legacyItems = this.draft !== '2020-12';
    let prefixSchemas: unknown[] | undefined;
    let prefixPath = '';
    let rest: unknown;
    let restPath = '';
    if (!legacyItems) {
      if (node.prefixItems !== undefined) {
        prefixSchemas = node.prefixItems as unknown[];
        prefixPath = `${path}/prefixItems`;
      }
      if (node.items !== undefined) {
        this.expect(
          !Array.isArray(node.items),
          'In 2020-12, items must be a schema; use prefixItems for tuples',
          `${path}/items`,
        );
        rest = node.items;
        restPath = `${path}/items`;
      }
    } else if (Array.isArray(node.items)) {
      prefixSchemas = node.items;
      prefixPath = `${path}/items`;
      if (node.additionalItems !== undefined) {
        rest = node.additionalItems;
        restPath = `${path}/additionalItems`;
      }
    } else if (node.items !== undefined) {
      rest = node.items;
      restPath = `${path}/items`;
    }

    const maxItems = node.maxItems;
    const minItems = node.minItems;
    if (maxItems !== undefined)
      this.expect(isNonNegativeInteger(maxItems), 'maxItems must be a non-negative integer', `${path}/maxItems`);
    if (minItems !== undefined)
      this.expect(isNonNegativeInteger(minItems), 'minItems must be a non-negative integer', `${path}/minItems`);
    if (minItems !== undefined) {
      const min = minItems as number;
      const issue: IssueData = {
        code: 'too_small',
        origin: 'array',
        minimum: min,
        inclusive: true,
        keyword: 'minItems',
        schemaPath: `${path}/minItems`,
      };
      out.push((value, ctx) => {
        if ((value as unknown[]).length >= min) return true;
        report(ctx, issue);
        return false;
      });
    }

    if (prefixSchemas !== undefined || rest !== undefined) {
      const fixed = (prefixSchemas ?? []).map((schema, i) => this.compile(schema, `${prefixPath}/${i}`));
      const restCheck = rest === undefined ? undefined : this.compile(rest, restPath);
      out.push((value, ctx) => {
        const items = value as unknown[];
        let ok = true;
        for (let i = 0; i < items.length; i++) {
          const check = i < fixed.length ? fixed[i] : restCheck;
          if (check === undefined) break;
          const from = ctx.issues.length;
          if (!check(items[i], ctx)) {
            ok = false;
            prefix(ctx, from, i);
            if (ctx.abort) return false;
          }
        }
        return ok;
      });
    }

    if (node.contains !== undefined) {
      const contains = this.compile(node.contains, `${path}/contains`);
      const modern = !legacyItems || this.draft === '2019-09';
      const minContains = modern && node.minContains !== undefined ? node.minContains : 1;
      const maxContains = modern ? node.maxContains : undefined;
      this.expect(
        isNonNegativeInteger(minContains),
        'minContains must be a non-negative integer',
        `${path}/minContains`,
      );
      if (maxContains !== undefined)
        this.expect(
          isNonNegativeInteger(maxContains),
          'maxContains must be a non-negative integer',
          `${path}/maxContains`,
        );
      const min = minContains as number;
      const max = maxContains as number | undefined;
      const tooFew: IssueData = {
        code: 'too_small',
        origin: 'contains',
        minimum: min,
        inclusive: true,
        keyword: node.minContains === undefined ? 'contains' : 'minContains',
        schemaPath: `${path}/${node.minContains === undefined ? 'contains' : 'minContains'}`,
      };
      const tooMany: IssueData | undefined =
        max === undefined
          ? undefined
          : {
              code: 'too_big',
              origin: 'contains',
              maximum: max,
              inclusive: true,
              keyword: 'maxContains',
              schemaPath: `${path}/maxContains`,
            };
      out.push((value, ctx) => {
        let count = 0;
        for (const item of value as unknown[]) {
          if (passes(contains, item, ctx)) {
            count++;
            if (max === undefined && count >= min) return true;
          }
        }
        if (count < min) {
          report(ctx, tooFew);
          return false;
        }
        if (max !== undefined && count > max) {
          report(ctx, tooMany!);
          return false;
        }
        return true;
      });
    }

    if (node.uniqueItems !== undefined) {
      this.expect(typeof node.uniqueItems === 'boolean', 'uniqueItems must be a boolean', `${path}/uniqueItems`);
      if (node.uniqueItems === true) {
        out.push((value, ctx) => {
          const duplicate = findDuplicate(value as unknown[]);
          if (duplicate === undefined) return true;
          report(ctx, {
            code: 'not_unique',
            indexes: duplicate,
            keyword: 'uniqueItems',
            schemaPath: `${path}/uniqueItems`,
          });
          return false;
        });
      }
    }

    const combined = this.combine(out, [], [], [], []);
    if (maxItems === undefined) {
      if (out.length > 0) target.push(combined);
      return;
    }
    // Oversized arrays fail on maxItems alone; their items are not visited (a cheap DoS guard).
    const max = maxItems as number;
    const issue: IssueData = {
      code: 'too_big',
      origin: 'array',
      maximum: max,
      inclusive: true,
      keyword: 'maxItems',
      schemaPath: `${path}/maxItems`,
    };
    target.push((value, ctx) => {
      if ((value as unknown[]).length > max) {
        report(ctx, issue);
        return false;
      }
      return combined(value, ctx);
    });
  }

  private objectKeywords(node: JSONObject, path: string, out: Validate[]): void {
    const count = (keyword: 'minProperties' | 'maxProperties') => {
      const n = node[keyword];
      if (n === undefined) return;
      this.expect(isNonNegativeInteger(n), `${keyword} must be a non-negative integer`, `${path}/${keyword}`);
      const limit = n as number;
      const min = keyword === 'minProperties';
      const issue: IssueData = min
        ? {
            code: 'too_small',
            origin: 'object',
            minimum: limit,
            inclusive: true,
            keyword,
            schemaPath: `${path}/${keyword}`,
          }
        : {
            code: 'too_big',
            origin: 'object',
            maximum: limit,
            inclusive: true,
            keyword,
            schemaPath: `${path}/${keyword}`,
          };
      out.push((value, ctx) => {
        const size = Object.keys(value as object).length;
        if (min ? size >= limit : size <= limit) return true;
        report(ctx, issue);
        return false;
      });
    };
    count('minProperties');
    count('maxProperties');

    if (node.required !== undefined) {
      this.expect(
        Array.isArray(node.required) && node.required.every((key) => typeof key === 'string'),
        'required must be an array of strings',
        `${path}/required`,
      );
      const keys = node.required as string[];
      const schemaPath = `${path}/required`;
      out.push((value, ctx) => {
        let ok = true;
        for (const key of keys) {
          if (hasOwn(value as object, key)) continue;
          report(ctx, { code: 'required', path: [key], keyword: 'required', schemaPath });
          ok = false;
          if (ctx.abort) return false;
        }
        return ok;
      });
    }

    const dependentRequired: [string, string[], string][] = [];
    const dependentSchemas: [string, Validate][] = [];
    const addRequired = (map: unknown, keyword: string) => {
      this.expect(isObject(map), `${keyword} must be an object`, `${path}/${keyword}`);
      for (const [key, value] of Object.entries(map as object)) {
        if (Array.isArray(value)) {
          this.expect(
            value.every((item) => typeof item === 'string'),
            `${keyword} lists must contain strings`,
            `${path}/${keyword}/${escapePointer(key)}`,
          );
          dependentRequired.push([key, value as string[], `${path}/${keyword}/${escapePointer(key)}`]);
        } else if (keyword === 'dependencies') {
          dependentSchemas.push([key, this.compile(value, `${path}/${keyword}/${escapePointer(key)}`)]);
        } else {
          this.fail(`${keyword} values must be arrays of strings`, `${path}/${keyword}/${escapePointer(key)}`);
        }
      }
    };
    if (node.dependentRequired !== undefined) addRequired(node.dependentRequired, 'dependentRequired');
    if (node.dependencies !== undefined && this.draft === 'draft-07') addRequired(node.dependencies, 'dependencies');
    if (isObject(node.dependentSchemas)) {
      for (const [key, value] of Object.entries(node.dependentSchemas)) {
        dependentSchemas.push([key, this.compile(value, `${path}/dependentSchemas/${escapePointer(key)}`)]);
      }
    }
    if (dependentRequired.length > 0) {
      out.push((value, ctx) => {
        let ok = true;
        for (const [key, needed, schemaPath] of dependentRequired) {
          if (!hasOwn(value as object, key)) continue;
          for (const other of needed) {
            if (hasOwn(value as object, other)) continue;
            report(ctx, {
              code: 'required',
              path: [other],
              keyword: this.draft === 'draft-07' ? 'dependencies' : 'dependentRequired',
              schemaPath,
            });
            ok = false;
            if (ctx.abort) return false;
          }
        }
        return ok;
      });
    }
    if (dependentSchemas.length > 0) {
      out.push((value, ctx) => {
        let ok = true;
        for (const [key, check] of dependentSchemas) {
          if (hasOwn(value as object, key) && !check(value, ctx)) {
            ok = false;
            if (ctx.abort) return false;
          }
        }
        return ok;
      });
    }

    const properties = isObject(node.properties) ? node.properties : undefined;
    const propertyChecks = new Map<string, Validate>();
    if (properties !== undefined) {
      for (const [key, schema] of Object.entries(properties)) {
        propertyChecks.set(key, this.compile(schema, `${path}/properties/${escapePointer(key)}`));
      }
    }
    const patterns: [RegExpLike, Validate][] = [];
    if (isObject(node.patternProperties)) {
      for (const [source, schema] of Object.entries(node.patternProperties)) {
        const at = `${path}/patternProperties/${escapePointer(source)}`;
        patterns.push([this.regex(source, at), this.compile(schema, at)]);
      }
    }
    const additional = node.additionalProperties;
    const additionalCheck =
      additional === undefined || additional === false
        ? undefined
        : this.compile(additional, `${path}/additionalProperties`);
    const forbidAdditional = additional === false;

    if (propertyChecks.size > 0 && patterns.length === 0 && additional === undefined) {
      // Common case: iterate the declared properties only.
      const entries = [...propertyChecks];
      out.push((value, ctx) => {
        const object = value as Record<string, unknown>;
        let ok = true;
        for (const [key, check] of entries) {
          if (!hasOwn(object, key)) continue;
          const from = ctx.issues.length;
          if (!check(object[key], ctx)) {
            ok = false;
            prefix(ctx, from, key);
            if (ctx.abort) return false;
          }
        }
        return ok;
      });
    } else if (propertyChecks.size > 0 || patterns.length > 0 || additional !== undefined) {
      const additionalPath = `${path}/additionalProperties`;
      out.push((value, ctx) => {
        const object = value as Record<string, unknown>;
        let ok = true;
        const extra: string[] = [];
        for (const key in object) {
          if (!hasOwn(object, key)) continue;
          let matched = false;
          const own = propertyChecks.get(key);
          const checks: Validate[] = [];
          if (own !== undefined) {
            matched = true;
            checks.push(own);
          }
          for (const [re, check] of patterns) {
            if (re.test(key)) {
              matched = true;
              checks.push(check);
            }
          }
          if (!matched) {
            if (forbidAdditional) {
              if (extra.length < 100) extra.push(key);
              continue;
            }
            if (additionalCheck !== undefined) checks.push(additionalCheck);
          }
          for (const check of checks) {
            const from = ctx.issues.length;
            if (!check(object[key], ctx)) {
              ok = false;
              prefix(ctx, from, key);
              if (ctx.abort) return false;
            }
          }
        }
        if (extra.length > 0) {
          report(ctx, {
            code: 'unrecognized_keys',
            keys: extra,
            keyword: 'additionalProperties',
            schemaPath: additionalPath,
          });
          ok = false;
        }
        return ok;
      });
    }

    if (node.propertyNames !== undefined) {
      const check = this.compile(node.propertyNames, `${path}/propertyNames`);
      const schemaPath = `${path}/propertyNames`;
      out.push((value, ctx) => {
        let ok = true;
        for (const key in value as object) {
          if (!hasOwn(value as object, key) || passes(check, key, ctx)) continue;
          ok = false;
          if (ctx.silent) {
            ctx.abort = true;
            return false;
          }
          const sub = branchCtx(ctx);
          check(key, sub);
          report(ctx, { code: 'invalid_key', path: [key], issues: sub.issues, keyword: 'propertyNames', schemaPath });
          if (ctx.abort) return false;
        }
        return ok;
      });
    }
  }

  private applicators(node: JSONObject, path: string, out: Validate[]): void {
    const list = (keyword: string) =>
      (node[keyword] as unknown[]).map((schema, i) => this.compile(schema, `${path}/${keyword}/${i}`));

    if (node.allOf !== undefined) {
      const members = list('allOf');
      out.push((value, ctx) => {
        let ok = true;
        for (const member of members) {
          if (!member(value, ctx)) {
            ok = false;
            if (ctx.abort) return false;
          }
        }
        return ok;
      });
    }

    const collect = (members: Validate[], value: unknown, ctx: Ctx): Issue[][] =>
      members.map((member) => {
        const sub = branchCtx(ctx);
        member(value, sub);
        return sub.issues;
      });

    if (node.anyOf !== undefined) {
      const members = list('anyOf');
      const extra = { keyword: 'anyOf', schemaPath: `${path}/anyOf` };
      out.push((value, ctx) => {
        for (const member of members) if (passes(member, value, ctx)) return true;
        reportUnionFailure(ctx, ctx.silent ? [] : collect(members, value, ctx), value, undefined, extra);
        return false;
      });
    }

    if (node.oneOf !== undefined) {
      const members = list('oneOf');
      const extra = { keyword: 'oneOf', schemaPath: `${path}/oneOf` };
      out.push((value, ctx) => {
        let matched = 0;
        for (const member of members) if (passes(member, value, ctx)) matched++;
        if (matched === 1) return true;
        if (matched === 0)
          reportUnionFailure(ctx, ctx.silent ? [] : collect(members, value, ctx), value, undefined, extra);
        else report(ctx, { code: 'invalid_union', branches: [], matched, ...extra });
        return false;
      });
    }

    if (node.not !== undefined) {
      const check = this.compile(node.not, `${path}/not`);
      const issue: IssueData = { code: 'forbidden', keyword: 'not', schemaPath: `${path}/not` };
      out.push((value, ctx) => {
        if (!passes(check, value, ctx)) return true;
        report(ctx, issue);
        return false;
      });
    }

    if (node.if !== undefined && (node.then !== undefined || node.else !== undefined)) {
      const condition = this.compile(node.if, `${path}/if`);
      const then = node.then === undefined ? undefined : this.compile(node.then, `${path}/then`);
      const otherwise = node.else === undefined ? undefined : this.compile(node.else, `${path}/else`);
      out.push((value, ctx) => {
        const branch = passes(condition, value, ctx) ? then : otherwise;
        return branch === undefined || branch(value, ctx);
      });
    }
  }
}

/** Adapts a JSON Schema validator to valiq-js's `run` contract. */
export function toRun(validate: Validate): (value: unknown, ctx: Ctx) => unknown {
  return (value, ctx) => (validate(value, ctx) ? value : FAIL);
}

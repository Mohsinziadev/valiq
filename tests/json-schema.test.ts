import { describe, expect, it } from 'vitest';
import { v } from '../src/index';
import { fromJSONSchema, JSONSchemaError } from '../src/json-schema/index';

describe('fromJSONSchema', () => {
  const Product = fromJSONSchema({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      sku: { type: 'string', pattern: '^[A-Z]{3}-\\d+$' },
      price: { type: 'number', exclusiveMinimum: 0 },
      tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    },
    required: ['sku', 'price'],
    additionalProperties: false,
  } as const);

  it('validates and reports issues with keyword and schemaPath', () => {
    expect(Product.is({ sku: 'ABC-1', price: 2 })).toBe(true);
    expect(Product.safeParse({ sku: 'abc', price: 0, tags: ['a', 'a'], x: 1 }).error?.issues).toEqual([
      {
        code: 'invalid_pattern',
        path: ['sku'],
        message: 'Expected a string matching /^[A-Z]{3}-\\d+$/',
        pattern: '^[A-Z]{3}-\\d+$',
        keyword: 'pattern',
        schemaPath: '#/properties/sku/pattern',
      },
      {
        code: 'too_small',
        path: ['price'],
        message: 'Expected a number greater than 0',
        origin: 'number',
        minimum: 0,
        inclusive: false,
        keyword: 'exclusiveMinimum',
        schemaPath: '#/properties/price/exclusiveMinimum',
      },
      {
        code: 'not_unique',
        path: ['tags'],
        message: 'Expected unique items, but items 0 and 1 are equal',
        indexes: [0, 1],
        keyword: 'uniqueItems',
        schemaPath: '#/properties/tags/uniqueItems',
      },
      {
        code: 'unrecognized_keys',
        path: [],
        message: 'Unrecognized key: "x"',
        keys: ['x'],
        keyword: 'additionalProperties',
        schemaPath: '#/additionalProperties',
      },
    ]);
  });

  it('reports missing required properties at their path', () => {
    expect(Product.safeParse({}).error?.issues.map((i) => [i.code, i.path])).toEqual([
      ['required', ['sku']],
      ['required', ['price']],
    ]);
  });

  it('composes with builder schemas', () => {
    const Order = v.object({ product: Product, quantity: v.number().int() });
    expect(Order.safeParse({ product: { sku: 'x', price: 1 }, quantity: 1 }).error?.issues[0]?.path).toEqual([
      'product',
      'sku',
    ]);
    expect(Product.optional().is(undefined)).toBe(true);
    expect(Product.refine((p) => p.price < 100).is({ sku: 'ABC-1', price: 500 })).toBe(false);
  });

  it('typed() declares the output type', () => {
    const loose: Record<string, unknown> = { type: 'string' };
    const schema = fromJSONSchema(loose).typed<string>();
    expect(schema.parse('x')).toBe('x');
  });

  describe('strict mode', () => {
    it('rejects unknown keywords with a suggestion', () => {
      expect(() => fromJSONSchema({ type: 'string', maxLenght: 3 })).toThrow(
        'Unknown keyword "maxLenght" (did you mean "maxLength"?)',
      );
      expect(() => fromJSONSchema({ properties: { a: { tpye: 'string' } } })).toThrow(
        /did you mean "type".*at #\/properties\/a\/tpye/,
      );
      expect(fromJSONSchema({ type: 'string', maxLenght: 3 }, { strict: false }).is('abcd')).toBe(true);
    });

    it('allows x- extension keywords and annotations', () => {
      expect(() =>
        fromJSONSchema({
          type: 'string',
          'x-internal': true,
          title: 't',
          description: 'd',
          examples: ['a'],
          default: 'a',
          deprecated: true,
        }),
      ).not.toThrow();
    });

    it('explains OpenAPI and draft-04 syntax', () => {
      expect(() => fromJSONSchema({ type: 'string', nullable: true })).toThrow(/OpenAPI 3\.0 syntax/);
      expect(() => fromJSONSchema({ type: 'number', minimum: 1, exclusiveMinimum: true })).toThrow(/draft-04 syntax/);
      expect(() => fromJSONSchema({ $schema: 'http://json-schema.org/draft-04/schema#' })).toThrow(/Draft-04/);
    });

    it('validates keyword values', () => {
      expect(() => fromJSONSchema({ minLength: -1 })).toThrow(/minLength must be a non-negative integer/);
      expect(() => fromJSONSchema({ type: 'strin' })).toThrow(/type must be/);
      expect(() => fromJSONSchema({ required: 'a' })).toThrow(/required must be an array/);
      expect(() => fromJSONSchema({ pattern: '(' })).toThrow(/Invalid pattern/);
      expect(() => fromJSONSchema({ multipleOf: 0 })).toThrow(/multipleOf/);
    });

    it('always rejects unsupported keywords, even when not strict', () => {
      expect(() => fromJSONSchema({ unevaluatedProperties: false }, { strict: false })).toThrow(JSONSchemaError);
      expect(() => fromJSONSchema({ $dynamicRef: '#x' }, { strict: false })).toThrow(/\$dynamicRef/);
    });
  });

  describe('formats', () => {
    it('asserts known formats by default and can annotate instead', () => {
      expect(fromJSONSchema({ format: 'email' }).is('nope')).toBe(false);
      expect(fromJSONSchema({ format: 'email' }).is('"quoted local"@example.com')).toBe(true);
      expect(fromJSONSchema({ format: 'email' }, { formats: 'annotate' }).is('nope')).toBe(true);
      expect(fromJSONSchema({ format: 'date' }).is(42)).toBe(true);
    });

    it('rejects unknown formats in strict mode', () => {
      expect(() => fromJSONSchema({ format: 'phone' })).toThrow(/Unknown format "phone"/);
      expect(fromJSONSchema({ format: 'phone' }, { strict: false }).is('x')).toBe(true);
    });

    it('accepts custom formats', () => {
      const schema = fromJSONSchema({ format: 'phone' }, { customFormats: { phone: /^\+\d{7,15}$/ } });
      expect(schema.is('+4912345678')).toBe(true);
      expect(schema.safeParse('123').error?.issues[0]).toMatchObject({ code: 'invalid_format', format: 'phone' });
      expect(fromJSONSchema({ format: 'even' }, { customFormats: { even: (s) => s.length % 2 === 0 } }).is('ab')).toBe(
        true,
      );
    });
  });

  describe('$ref', () => {
    it('resolves $defs, definitions, anchors and recursion', () => {
      const tree = fromJSONSchema({
        $defs: {
          node: { type: 'object', properties: { children: { type: 'array', items: { $ref: '#/$defs/node' } } } },
        },
        $ref: '#/$defs/node',
      });
      expect(tree.is({ children: [{ children: [] }] })).toBe(true);
      expect(tree.is({ children: [{ children: 1 }] })).toBe(false);
      const anchored = fromJSONSchema({ $defs: { a: { $anchor: 'pos', minimum: 0 } }, $ref: '#pos' });
      expect(anchored.is(-1)).toBe(false);
    });

    it('resolves registered schemas and never fetches', () => {
      const address = { $id: 'https://example.com/address.json', type: 'object', required: ['city'] } as const;
      const person = fromJSONSchema(
        { type: 'object', properties: { home: { $ref: 'https://example.com/address.json' } } },
        { schemas: [address] },
      );
      expect(person.safeParse({ home: {} }).error?.issues[0]).toMatchObject({
        code: 'required',
        path: ['home', 'city'],
      });
      expect(() => fromJSONSchema({ $ref: 'https://example.com/missing.json' })).toThrow(/"schemas" option/);
      const byKey = fromJSONSchema(
        { $ref: 'urn:example:int' },
        { schemas: { 'urn:example:int': { type: 'integer' } } },
      );
      expect(byKey.is(1.5)).toBe(false);
    });

    it('reports unresolvable local refs at compile time', () => {
      expect(() => fromJSONSchema({ $ref: '#/$defs/nope' })).toThrow(/Cannot resolve \$ref "#\/\$defs\/nope"/);
    });

    it('limits recursion depth', () => {
      const list = fromJSONSchema({ type: 'object', properties: { next: { $ref: '#' } } });
      const root: Record<string, unknown> = {};
      let node = root;
      for (let i = 0; i < 50_000; i++) node = node.next = {};
      expect(list.safeParse(root).error?.issues[0]?.code).toBe('too_deep');
      expect(list.is(root)).toBe(false);
    });
  });

  describe('drafts', () => {
    it('detects the dialect from $schema', () => {
      expect(fromJSONSchema({ $schema: 'http://json-schema.org/draft-07/schema#' }).draft).toBe('draft-07');
      expect(fromJSONSchema({ $schema: 'https://json-schema.org/draft/2019-09/schema' }).draft).toBe('2019-09');
      expect(fromJSONSchema({}).draft).toBe('2020-12');
      expect(() => fromJSONSchema({ $schema: 'https://example.com/custom' })).toThrow(/Unknown \$schema/);
    });

    it('applies draft-07 tuple and dependency semantics', () => {
      const tuple = fromJSONSchema({ items: [{ type: 'string' }], additionalItems: false }, { draft: 'draft-07' });
      expect(tuple.is(['a'])).toBe(true);
      expect(tuple.is(['a', 1])).toBe(false);
      const deps = fromJSONSchema({ dependencies: { card: ['billing'] } }, { draft: 'draft-07' });
      expect(deps.safeParse({ card: 1 }).error?.issues[0]).toMatchObject({ code: 'required', path: ['billing'] });
      expect(() => fromJSONSchema({ items: [{}] })).toThrow(/prefixItems/);
    });
  });

  it('uses the regExp option for patterns', () => {
    const seen: string[] = [];
    const schema = fromJSONSchema(
      { pattern: '^a', patternProperties: { '^x-': {} } },
      {
        regExp: (source) => {
          seen.push(source);
          return new RegExp(source);
        },
      },
    );
    expect(schema.is('abc')).toBe(true);
    expect(seen).toEqual(['^a', '^x-']);
  });

  it('reports oneOf ambiguity', () => {
    const schema = fromJSONSchema({ oneOf: [{ type: 'number' }, { type: 'integer' }] });
    expect(schema.safeParse(1).error?.issues[0]).toMatchObject({ code: 'invalid_union', matched: 2, keyword: 'oneOf' });
    expect(schema.is(1.5)).toBe(true);
  });

  it('reports propertyNames failures as invalid_key', () => {
    const schema = fromJSONSchema({ propertyNames: { maxLength: 3 } });
    expect(schema.safeParse({ abcd: 1 }).error?.issues[0]).toMatchObject({ code: 'invalid_key', path: ['abcd'] });
  });
});

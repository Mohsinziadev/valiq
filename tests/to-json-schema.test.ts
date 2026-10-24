import Ajv2020 from 'ajv/dist/2020';
import Ajv7 from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { toJSONSchema, v, type Schema } from '../src/index';
import { fromJSONSchema } from '../src/json-schema/index';

const ajv2020 = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv2020);
const ajv7 = new Ajv7({ strict: true, allErrors: true });
addFormats(ajv7);

const User = v
  .object({
    id: v.string().uuid(),
    email: v.string().email().max(254),
    age: v.number().int().min(0).lt(150),
    role: v.enum(['admin', 'user']).default('user'),
    tags: v.array(v.string().min(1)).max(10).unique(),
    nickname: v.string().nullable().optional(),
    point: v.tuple([v.number(), v.number()]),
    meta: v.record(v.string().regex(/^[a-z]+$/), v.unknown()),
    kind: v.literal('person'),
  })
  .strict()
  .meta({ title: 'User', description: 'An account' });

describe('toJSONSchema', () => {
  it('produces the expected 2020-12 document', () => {
    expect(toJSONSchema(User)).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'User',
      description: 'An account',
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email', maxLength: 254 },
        age: { type: 'integer', minimum: 0, exclusiveMaximum: 150 },
        role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
        tags: { type: 'array', items: { type: 'string', minLength: 1 }, maxItems: 10, uniqueItems: true },
        nickname: { type: ['string', 'null'] },
        point: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          prefixItems: [{ type: 'number' }, { type: 'number' }],
          items: false,
        },
        meta: { type: 'object', additionalProperties: {}, propertyNames: { pattern: '^[a-z]+$' } },
        kind: { type: 'string', const: 'person' },
      },
      required: ['id', 'email', 'age', 'tags', 'point', 'meta', 'kind'],
      additionalProperties: false,
    });
  });

  it('produces schemas accepted by Ajv in strict mode (2020-12 and draft-07)', () => {
    expect(() => ajv2020.compile(toJSONSchema(User))).not.toThrow();
    expect(() => ajv7.compile(toJSONSchema(User, { target: 'draft-07' }))).not.toThrow();
    const draft7 = toJSONSchema(User, { target: 'draft-07' }) as { properties: { point: unknown } };
    expect(draft7.properties.point).toMatchObject({
      items: [{ type: 'number' }, { type: 'number' }],
      additionalItems: false,
    });
  });

  it('agrees with the source schema on sample data', () => {
    const exported = ajv2020.compile(toJSONSchema(User));
    const roundTrip = fromJSONSchema(toJSONSchema(User) as Record<string, unknown>);
    const samples: unknown[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'a@b.co',
        age: 3,
        tags: [],
        point: [1, 2],
        meta: {},
        kind: 'person',
      },
      { id: 'x', email: 'a@b.co', age: 3, tags: [], point: [1, 2], meta: {}, kind: 'person' },
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'a@b.co',
        age: 3.5,
        tags: ['a', 'a'],
        point: [1],
        meta: { A: 1 },
        kind: 'x',
        extra: 1,
      },
      {},
    ];
    for (const sample of samples) {
      expect(exported(sample), JSON.stringify(sample)).toBe(User.is(sample));
      expect(roundTrip.is(sample)).toBe(User.is(sample));
    }
  });

  it('distinguishes input and output for defaults, strip and transforms', () => {
    const schema = v.object({ a: v.string().default('x'), b: v.string().trim().min(2) }).strip();
    expect(toJSONSchema(schema, { io: 'input' })).toMatchObject({
      required: ['b'],
      properties: { b: { type: 'string' } },
    });
    expect(toJSONSchema(schema, { io: 'input' })).not.toHaveProperty('additionalProperties');
    expect(toJSONSchema(schema, { io: 'output' })).toMatchObject({
      required: ['a', 'b'],
      additionalProperties: false,
      properties: { b: { type: 'string', minLength: 2 } },
    });
  });

  it('exports recursive schemas with $defs', () => {
    interface Node {
      value: number;
      next?: Node | undefined;
    }
    const Node: Schema<Node> = v.lazy(() => v.object({ value: v.number(), next: Node.optional() }));
    const json = toJSONSchema(Node);
    expect(json).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $ref: '#/$defs/Schema1',
      $defs: {
        Schema1: {
          type: 'object',
          properties: { value: { type: 'number' }, next: { $ref: '#/$defs/Schema1' } },
          required: ['value'],
        },
      },
    });
    const validate = ajv2020.compile(json);
    expect(validate({ value: 1, next: { value: 2 } })).toBe(true);
    expect(validate({ value: 1, next: { value: 'x' } })).toBe(false);
  });

  it('throws for unrepresentable schemas unless asked to emit {}', () => {
    expect(() => toJSONSchema(v.date())).toThrow(/cannot be represented/);
    expect(() => toJSONSchema(v.string().transform(Number), { io: 'output' })).toThrow();
    expect(toJSONSchema(v.object({ d: v.date() }), { unrepresentable: 'any' })).toMatchObject({
      properties: { d: {} },
    });
    expect(() => toJSONSchema(v.string(), { target: 'openapi-3.0' as never })).toThrow(
      /Unsupported JSON Schema target/,
    );
  });

  it('converts unions, intersections, numbers and string patterns', () => {
    expect(toJSONSchema(v.union([v.string(), v.number().multipleOf(2)]))).toMatchObject({
      anyOf: [{ type: 'string' }, { type: 'number', multipleOf: 2 }],
    });
    expect(toJSONSchema(v.intersection([v.object({}), v.object({})]))).toHaveProperty('allOf');
    expect(toJSONSchema(v.string().startsWith('a.b').endsWith('$'))).toMatchObject({
      pattern: '^a\\.b',
      allOf: [{ pattern: '\\$$' }],
    });
    const local = toJSONSchema(v.string().isoTime()) as { pattern: string };
    expect(new RegExp(local.pattern).test('23:59')).toBe(true);
    expect(new RegExp(local.pattern).test('24:00')).toBe(false);
  });

  it('embeds JSON Schema-backed schemas', () => {
    const inner = fromJSONSchema({ $defs: { n: { type: 'number' } }, $ref: '#/$defs/n' });
    const json = toJSONSchema(v.object({ n: inner }));
    const validate = ajv2020.compile(json);
    expect(validate({ n: 1 })).toBe(true);
    expect(validate({ n: 'x' })).toBe(false);
  });
});

describe('Standard Schema', () => {
  it('implements ~standard validate', () => {
    const std = v.object({ a: v.string() })['~standard'];
    expect(std.version).toBe(1);
    expect(std.vendor).toBe('valiq');
    expect(std.validate({ a: 'x' })).toEqual({ value: { a: 'x' } });
    const failure = std.validate({}) as { issues: { message: string; path: unknown[] }[] };
    expect(failure.issues[0]).toMatchObject({ message: 'Required', path: ['a'] });
  });

  it('implements ~standard jsonSchema', () => {
    const std = v.string().min(1)['~standard'];
    expect(std.jsonSchema.input({ target: 'draft-2020-12' })).toMatchObject({ type: 'string', minLength: 1 });
    expect(std.jsonSchema.output({ target: 'draft-07' })).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
    });
    expect(() => std.jsonSchema.input({ target: 'openapi-3.0' })).toThrow();
  });
});

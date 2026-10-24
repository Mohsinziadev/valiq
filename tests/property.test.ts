// Property-based and differential tests (fast-check): Valiq's JSON Schema validator must agree with
// Ajv, exported schemas must agree with their source, and no input may crash or be mutated.
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toJSONSchema, v, type AnySchema } from '../src/index';
import { fromJSONSchema, type JSONSchemaDocument } from '../src/json-schema/index';

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv, ['date', 'ipv4', 'uuid']);

const json = fc.jsonValue({ maxDepth: 4 });

/**
 * Ajv checks multipleOf with `parseInt(x / d)`, which is wrong once the quotient reaches 1e21
 * (`parseInt(1e21) === 1`). Valiq is exact there (see the unit test below), so differential runs
 * skip such numbers.
 */
function hasHugeNumber(value: unknown): boolean {
  if (typeof value === 'number') return Math.abs(value) >= 1e15;
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).some(hasHugeNumber);
}
const runs = { numRuns: 400 };

const jsonSchemas: JSONSchemaDocument[] = [
  { type: 'object', properties: { a: { type: 'string', minLength: 2 }, b: { type: 'integer' } }, required: ['a'] },
  { type: 'array', items: { type: ['number', 'null'] }, minItems: 1, uniqueItems: true },
  {
    anyOf: [
      { type: 'string', maxLength: 3 },
      { type: 'number', minimum: 0, multipleOf: 0.5 },
    ],
  },
  { oneOf: [{ type: 'integer' }, { type: 'number', maximum: 1 }] },
  { not: { type: 'object' } },
  { if: { type: 'object', required: ['x'] }, then: { properties: { y: { const: 1 } } }, else: { type: 'array' } },
  { type: 'object', patternProperties: { '^[a-c]': { type: 'boolean' } }, additionalProperties: { type: 'number' } },
  { type: 'object', propertyNames: { maxLength: 2 }, minProperties: 1, maxProperties: 3 },
  { prefixItems: [{ type: 'string' }, { type: 'boolean' }], items: false },
  { contains: { type: 'string' }, minContains: 2, maxContains: 3 },
  { enum: [1, 'a', null, [1, 2], { k: true }] },
  { $defs: { n: { type: 'array', items: { $ref: '#/$defs/n' } } }, $ref: '#/$defs/n' },
  { dependentRequired: { a: ['b'] }, dependentSchemas: { c: { required: ['d'] } } },
  { type: 'string', format: 'date' },
  { type: 'string', pattern: '^\\d+$', format: 'ipv4' },
  { allOf: [{ minimum: 1 }, { exclusiveMaximum: 10 }], type: 'number' },
];

describe('differential: fromJSONSchema vs Ajv', () => {
  for (const [i, schema] of jsonSchemas.entries()) {
    it(`schema #${i} ${JSON.stringify(schema).slice(0, 60)}`, () => {
      const ours = fromJSONSchema(schema);
      const theirs = ajv.compile(schema);
      fc.assert(
        fc.property(json, (data) => {
          fc.pre(!hasHugeNumber(data));
          let expected: boolean;
          try {
            expected = theirs(data) as boolean;
          } catch {
            // Ajv's deep equality throws on objects with a non-function `toString` key (see below).
            expect(typeof ours.safeParse(data).success).toBe('boolean');
            return;
          }
          expect(ours.is(data)).toBe(expected);
          expect(ours.safeParse(data).success).toBe(expected);
        }),
        runs,
      );
    });
  }
});

describe('known Ajv deviations', () => {
  it('enum/const comparisons handle objects with a "toString" key', () => {
    const data = JSON.parse('{"toString":null}');
    expect(fromJSONSchema({ enum: [{ k: true }] }).is(data)).toBe(false);
    expect(fromJSONSchema({ const: { toString: null } }).is(data)).toBe(true);
    expect(() => ajv.compile({ enum: [{ k: true }] })(data)).toThrow(TypeError); // fast-deep-equal calls a.toString()
  });

  it('multipleOf stays exact for very large quotients', () => {
    expect(fromJSONSchema({ multipleOf: 0.5 }).is(5e20)).toBe(true); // 5e20 = 1e21 × 0.5
    expect(ajv.compile({ multipleOf: 0.5 })(5e20)).toBe(false);
  });
});

const builderSchemas: AnySchema[] = [
  v.object({ name: v.string().min(1).max(5), age: v.number().int().min(0).optional() }),
  v.object({ id: v.string() }).strict(),
  v.array(v.union([v.string(), v.number().gt(-1)])).max(4),
  v.record(v.string().max(3), v.boolean()),
  v.tuple([v.string(), v.number()]).rest(v.null()),
  v.union([v.object({ t: v.literal('a'), x: v.number() }), v.object({ t: v.literal('b'), y: v.string() })]),
  v.enum(['a', 'b', 1]),
  v.number().multipleOf(0.25).lt(100),
  v
    .string()
    .regex(/^[a-z]*$/)
    .nullable(),
  v.array(v.unknown()).unique(),
];

describe('properties of builder schemas', () => {
  it('is() agrees with safeParse().success, and parsing never throws', () => {
    for (const schema of builderSchemas) {
      fc.assert(
        fc.property(fc.anything({ maxDepth: 3 }), (data) => {
          expect(schema.is(data)).toBe(schema.safeParse(data).success);
        }),
        { numRuns: 200 },
      );
    }
  });

  it('exported JSON Schemas agree with their source', () => {
    for (const schema of builderSchemas) {
      const exported = ajv.compile(toJSONSchema(schema));
      fc.assert(
        fc.property(json, (data) => {
          fc.pre(!hasHugeNumber(data));
          expect(exported(data)).toBe(schema.is(data));
        }),
        { numRuns: 300 },
      );
    }
  });

  it('valid input is returned by reference for schemas without transforms', () => {
    for (const schema of builderSchemas) {
      fc.assert(
        fc.property(json, (data) => {
          const result = schema.safeParse(data);
          if (result.success) expect(result.data).toBe(data);
        }),
        { numRuns: 200 },
      );
    }
  });

  it('never mutates frozen input', () => {
    const schema = v.object({ a: v.string().trim().optional(), b: v.array(v.number().default(0)).optional() }).strip();
    fc.assert(
      fc.property(fc.anything({ maxDepth: 3 }), (data) => {
        const frozen = structuredCloneSafe(data);
        if (frozen === undefined) return;
        deepFreeze(frozen);
        schema.safeParse(frozen);
      }),
      { numRuns: 300 },
    );
  });

  it('every issue has a path array and a message', () => {
    for (const schema of builderSchemas) {
      fc.assert(
        fc.property(fc.anything({ maxDepth: 3 }), (data) => {
          const result = schema.safeParse(data);
          if (result.success) return;
          for (const issue of result.error.issues) {
            expect(Array.isArray(issue.path)).toBe(true);
            expect(typeof issue.message).toBe('string');
            expect(issue.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 200 },
      );
    }
  });
});

function structuredCloneSafe(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
}

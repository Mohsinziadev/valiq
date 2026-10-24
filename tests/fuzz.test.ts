// Fuzzing with exotic values (null-prototype objects, sparse arrays, BigInt, Map/Set, typed arrays,
// boxed primitives): validation must never throw, and is() must agree with safeParse().
import fc from 'fast-check';
import { it, expect } from 'vitest';
import { v, toJSONSchema, type AnySchema } from '../src/index';
import { fromJSONSchema } from '../src/json-schema/index';

const exotic = fc.anything({
  maxDepth: 4,
  withBigInt: true,
  withDate: true,
  withMap: true,
  withSet: true,
  withNullPrototype: true,
  withSparseArray: true,
  withTypedArray: true,
  withBoxedValues: true,
  withObjectString: true,
});
const schemas: AnySchema[] = [
  v
    .object({
      a: v.string().trim().min(1).optional(),
      b: v.array(v.number().default(0)).optional(),
      c: v.record(v.string(), v.unknown()).optional(),
    })
    .strip(),
  v.object({ toString: v.string().optional(), constructor: v.unknown(), __proto__: v.number().optional() }).strict(),
  v.union([v.object({ t: v.literal('a') }), v.object({ t: v.literal('b'), n: v.number() }), v.string()]),
  v.union([v.object({ x: v.number() }), v.object({ y: v.string() })]),
  v.array(v.unknown()).unique(),
  v.tuple([v.string(), v.number().int()]).rest(v.boolean()),
  v.intersection([v.object({ a: v.string().default('x') }), v.object({ b: v.number().default(1) })]),
  v.record(v.enum(['a', 'b']), v.array(v.string())),
  v.coerce.number().int().min(0),
  v.coerce.boolean(),
  v.coerce.date(),
  v.date().min(0),
  v.string().email().max(50),
  v.string().url(),
  v.string().uuid(),
  v.string().ipv6(),
  v.string().isoDateTime(),
  v.string().hostname(),
  fromJSONSchema({
    type: 'object',
    properties: { a: { enum: [1, 'x', null, { k: [1] }] } },
    patternProperties: { '^b': { type: 'array', uniqueItems: true } },
    additionalProperties: { not: { type: 'object' } },
    propertyNames: { maxLength: 5 },
  }),
  fromJSONSchema({
    anyOf: [
      { type: 'string', format: 'date-time' },
      { type: 'array', contains: { const: 1 }, maxContains: 2 },
      { $ref: '#/$defs/o' },
    ],
    $defs: { o: { type: 'object', properties: { n: { $ref: '#/$defs/o' } }, dependentRequired: { a: ['b'] } } },
  }),
  fromJSONSchema({
    oneOf: [{ type: 'integer' }, { multipleOf: 0.5 }, { if: { type: 'string' }, then: { minLength: 2 }, else: false }],
  }),
];
it('never throws, is() agrees with safeParse(), issues are well-formed', () => {
  for (const schema of schemas) {
    fc.assert(
      fc.property(exotic, (data) => {
        const result = schema.safeParse(data);
        expect(schema.is(data)).toBe(result.success);
        if (!result.success)
          for (const issue of result.error.issues) {
            expect(Array.isArray(issue.path)).toBe(true);
            expect(issue.message.length).toBeGreaterThan(0);
            JSON.stringify(issue);
          }
      }),
      { numRuns: 300 },
    );
  }
  for (const schema of schemas.slice(0, 8)) {
    expect(() => toJSONSchema(schema, { unrepresentable: 'any' }), schema.kind).not.toThrow();
  }
});

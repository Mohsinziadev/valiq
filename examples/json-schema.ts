// Using existing JSON Schema documents, and exporting Valiq schemas to JSON Schema (e.g. OpenAPI).
import assert from 'node:assert/strict';
import { toJSONSchema, v, type Infer } from 'valiq-js';
import { fromJSONSchema } from 'valiq-js/json-schema';

// 1. Validate with a JSON Schema. `as const` lets TypeScript infer the data type.
const Product = fromJSONSchema({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
    price: { $ref: '#/$defs/money' },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  },
  required: ['sku', 'price'],
  additionalProperties: false,
  $defs: { money: { type: 'number', minimum: 0, multipleOf: 0.01 } },
} as const);

type Product = Infer<typeof Product>; // { sku: string; price: number; tags?: string[] }
const product: Product = Product.parse({ sku: 'ABC-1234', price: 19.99 });
assert.equal(product.price, 19.99);

const failure = Product.safeParse({ sku: 'abc', price: 1.234 });
assert.equal(failure.success, false);
// JSON Schema issues also say which keyword failed and where it lives in the schema.
assert.deepEqual(
  failure.error?.issues.map((i) => i.schemaPath),
  ['#/properties/sku/pattern', '#/$defs/money/multipleOf'],
);

// 2. Typos in schemas fail at startup, not in production traffic.
assert.throws(() => fromJSONSchema({ type: 'string', maxLenght: 10 }), /did you mean "maxLength"/);

// 3. Export a Valiq schema, e.g. for an OpenAPI document or another service.
const User = v.object({ id: v.string().uuid(), email: v.string().email(), age: v.number().int().min(0).optional() });
const userSchema = toJSONSchema(User);
assert.deepEqual(userSchema.required, ['id', 'email']);

// 4. JSON Schema-backed schemas compose with builder schemas.
const Order = v.object({ product: Product, quantity: v.number().int().min(1) });
assert.equal(Order.is({ product: { sku: 'ABC-1234', price: 5 }, quantity: 2 }), true);
console.log(JSON.stringify(userSchema, null, 2));

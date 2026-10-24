// Custom rules: refinements, custom types, branded types and custom JSON Schema formats.
import assert from 'node:assert/strict';
import { v, type Infer } from 'valiq';
import { fromJSONSchema } from 'valiq/json-schema';

// A reusable rule on top of a built-in schema.
const Slug = v
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and dashes')
  .refine((slug) => !slug.startsWith('-') && !slug.endsWith('-'), 'Slugs cannot start or end with a dash');

assert.equal(Slug.is('hello-world'), true);
assert.equal(Slug.safeParse('-hello').error?.issues[0]?.message, 'Slugs cannot start or end with a dash');

// A type JSON cannot express, checked by a type guard.
const Bytes = v.custom((value): value is Uint8Array => value instanceof Uint8Array, 'Expected binary data');
assert.equal(Bytes.is(new Uint8Array(4)), true);

// Branded IDs stop an OrderId from being passed where a UserId is expected.
const UserId = v.string().uuid().brand<'UserId'>();
type UserId = Infer<typeof UserId>;
function loadUser(id: UserId): string {
  return `user ${id}`;
}
assert.equal(
  loadUser(UserId.parse('7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a')),
  'user 7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a',
);

// Transform + pipe: parse "1,234.50" into a validated number.
const Amount = v
  .string()
  .transform((text) => Number(text.replaceAll(',', '')))
  .pipe(v.number().min(0));
assert.equal(Amount.parse('1,234.50'), 1234.5);

// Custom formats for JSON Schema.
const Phone = fromJSONSchema({ type: 'string', format: 'e164' }, { customFormats: { e164: /^\+[1-9]\d{6,14}$/ } });
assert.equal(Phone.is('+923001234567'), true);
assert.equal(Phone.is('0300-1234567'), false);
console.log('custom validators ok');

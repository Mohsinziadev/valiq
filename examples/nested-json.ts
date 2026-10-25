// Nested JSON, arrays of objects, discriminated unions and readable error output.
import assert from 'node:assert/strict';
import { formatPath, v, type Infer } from 'valiq-js';

const Address = v.object({ street: v.string(), city: v.string(), country: v.string().length(2) });

const Payment = v.union([
  v.object({ method: v.literal('card'), last4: v.string().regex(/^\d{4}$/) }),
  v.object({ method: v.literal('bank'), iban: v.string().min(15) }),
]);

const Customer = v.object({
  id: v.string(),
  addresses: v.array(Address).min(1),
  payments: v.array(Payment),
  tags: v.record(v.string(), v.string()).optional(),
});

export type Customer = Infer<typeof Customer>;

const result = Customer.safeParse({
  id: 'c_1',
  addresses: [{ street: 'Main St 1', city: 'Lahore', country: 'PAK' }],
  payments: [{ method: 'card', last4: '12' }, { method: 'cash' }],
});

assert.equal(result.success, false);
if (!result.success) {
  // Exact paths for every issue; the union reports the member selected by `method`.
  assert.deepEqual(
    result.error.issues.map((issue) => formatPath(issue.path)),
    ['addresses[0].country', 'payments[0].last4', 'payments[1].method'],
  );
  console.log(result.error.format());
}

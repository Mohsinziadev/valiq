// Validating a JSON request body in a plain Node.js HTTP handler (no framework needed).
// The same pattern works in Express, Fastify, Hono or Next.js route handlers.
import assert from 'node:assert/strict';
import { v, type Infer } from 'valiq-js';

const CreateOrder = v
  .object({
    customerId: v.string().uuid(),
    items: v
      .array(
        v.object({
          sku: v.string().regex(/^[A-Z]{3}-\d{4}$/, 'SKU must look like ABC-1234'),
          quantity: v.number().int().min(1).max(100),
        }),
      )
      .min(1, 'An order needs at least one item'),
    note: v.string().max(500).optional(),
  })
  .strip(); // Drop unexpected fields (e.g. "total" or "status") instead of passing them on.

type CreateOrder = Infer<typeof CreateOrder>;

/** Returns [status, body] the way a route handler would. */
export function handleCreateOrder(body: unknown): [number, unknown] {
  const result = CreateOrder.safeParse(body);
  if (!result.success) {
    // Issues are plain JSON with stable codes and paths, and never echo the submitted values.
    return [400, { error: 'invalid_request', issues: result.error.issues }];
  }
  const order: CreateOrder = result.data;
  return [201, { ok: true, items: order.items.length }];
}

const [okStatus] = handleCreateOrder({
  customerId: '7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a',
  items: [{ sku: 'ABC-1234', quantity: 2 }],
  status: 'paid', // stripped
});
assert.equal(okStatus, 201);

const [badStatus, badBody] = handleCreateOrder({ customerId: 'nope', items: [{ sku: 'x', quantity: 0 }] });
assert.equal(badStatus, 400);
console.log(JSON.stringify(badBody, null, 2));

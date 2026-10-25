import { v } from 'valiq-js';

export const CreateOrder = v
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
    delivery: v.union([
      v.object({ method: v.literal('pickup'), store: v.string() }),
      v.object({ method: v.literal('courier'), address: v.string().min(5) }),
    ]),
  })
  .strip(); // Drop unexpected fields instead of passing them on.

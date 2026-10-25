import { v } from 'valiq';

const Order = v.object({
  items: v.array(v.object({ sku: v.string().min(3), qty: v.number().int().min(1) })).min(1),
});

const result = Order.safeParse({ items: [{ sku: 'AB', qty: 0 }] });
if (!result.success) {
  console.log(result.error.issues);
  // [{ code: 'too_small', path: ['items', 0, 'sku'], message: 'Expected at least 3 characters',
  //    origin: 'string', minimum: 3, inclusive: true }, ...]
  console.log(result.error.format());
  // ✖ Expected at least 3 characters
  //   → at items[0].sku
}

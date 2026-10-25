// Define schemas once, at module level, and reuse them. Valiq compiles a schema the first time it
// is used and caches the result on the schema object; creating schemas inside a request handler
// would repeat that work on every call.
import assert from 'node:assert/strict';
import { v } from 'valiq-js';
import { fromJSONSchema } from 'valiq-js/json-schema';

const Event = v.union([
  v.object({ type: v.literal('click'), x: v.number(), y: v.number() }),
  v.object({ type: v.literal('scroll'), delta: v.number() }),
]);
const Batch = v.array(Event).max(1000);

// JSON Schemas compile eagerly, so invalid schemas fail at import time.
const LegacyEvent = fromJSONSchema({ type: 'object', required: ['type'] });

export function ingest(payload: unknown): number {
  // is() is the fastest check when you only need yes/no and no transformed output.
  if (!Batch.is(payload)) return 0;
  return payload.length;
}

const batch = Array.from({ length: 1000 }, (_, i) =>
  i % 2 ? { type: 'click', x: i, y: i } : { type: 'scroll', delta: i },
);
const started = performance.now();
let total = 0;
for (let i = 0; i < 200; i++) total += ingest(batch);
const elapsed = performance.now() - started;
assert.equal(total, 200_000);
assert.equal(LegacyEvent.is({ type: 'x' }), true);
console.log(`validated 200,000 events in ${elapsed.toFixed(1)} ms`);

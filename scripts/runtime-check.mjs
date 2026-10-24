// Exercises the built package (ESM and CJS) on the current Node.js version, without dev tooling.
// CI runs it on every supported Node.js version. Run after `npm run build`.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { toJSONSchema, v } from '../dist/index.js';
import { fromJSONSchema } from '../dist/json-schema/index.js';

const require = createRequire(import.meta.url);
const cjs = require('../dist/index.cjs');
const cjsJSON = require('../dist/json-schema/index.cjs');

for (const [label, lib, json] of [
  ['esm', { v, toJSONSchema }, { fromJSONSchema }],
  ['cjs', cjs, cjsJSON],
]) {
  const User = lib.v.object({
    id: lib.v.string().uuid(),
    email: lib.v.string().trim().toLowerCase().email(),
    tags: lib.v.array(lib.v.string()).default([]),
    created: lib.v.string().isoDateTime(),
    site: lib.v.string().url().optional(),
  });
  const input = { id: '7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a', email: ' A@B.CO ', created: '2024-01-01T00:00:00Z' };
  assert.deepEqual(User.parse(input), { ...input, email: 'a@b.co', tags: [] });
  assert.equal(User.safeParse({}).error.issues.length, 3);
  assert.equal(User.safeParse({ ...input, site: 'javascript:alert(1)' }).success, false);
  const exported = lib.toJSONSchema(User);
  assert.equal(json.fromJSONSchema(exported).is({ ...input, email: 'a@b.co' }), true);
  const Tree = json.fromJSONSchema({ type: 'object', properties: { next: { $ref: '#' } } });
  let deep = {};
  const root = deep;
  for (let i = 0; i < 20_000; i++) deep = deep.next = {};
  assert.equal(Tree.safeParse(root).error.issues[0].code, 'too_deep');
  console.log(`✓ ${label} on Node.js ${process.version}`);
}

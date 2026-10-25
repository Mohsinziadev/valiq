// Packs the library, installs the tarball into a fresh consumer project and checks that it works
// from ESM, CommonJS and TypeScript (node16 and bundler resolution). Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, '.smoke');
const app = resolve(dir, 'app');
const run = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (error) {
    console.error(String(error.stdout ?? ''), String(error.stderr ?? ''));
    throw new Error(`Smoke test step failed: ${cmd} ${args.join(' ')}`);
  }
};

await rm(dir, { recursive: true, force: true });
await mkdir(app, { recursive: true });
const tarball = run('npm', ['pack', '--silent', '--pack-destination', dir], root).trim().split('\n').pop();
await writeFile(resolve(app, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
run('npm', ['install', '--silent', '--no-audit', '--no-fund', resolve(dir, tarball)], app);

const esm = `
import assert from 'node:assert/strict';
import { v, ValiqError, toJSONSchema } from 'valiq-js';
import { fromJSONSchema } from 'valiq-js/json-schema';
const User = v.object({ email: v.string().email(), age: v.number().int().min(18) });
assert.deepEqual(User.parse({ email: 'dev@example.com', age: 30 }), { email: 'dev@example.com', age: 30 });
const bad = User.safeParse({ email: 'x', age: 1 });
assert.equal(bad.success, false);
assert.ok(bad.error instanceof ValiqError);
assert.deepEqual(bad.error.issues.map((i) => i.path), [['email'], ['age']]);
const json = fromJSONSchema(toJSONSchema(User));
assert.equal(json.is({ email: 'dev@example.com', age: 30 }), true);
assert.equal(json.is({ email: 'dev@example.com', age: 3 }), false);
assert.equal(User['~standard'].vendor, 'valiq');
console.log('esm ok');
`;
const cjs = `
const assert = require('node:assert/strict');
const { v, isValiqError } = require('valiq-js');
const { fromJSONSchema, JSONSchemaError } = require('valiq-js/json-schema');
assert.equal(v.string().min(2).is('ab'), true);
try { v.number().parse('1'); assert.fail(); } catch (e) { assert.ok(isValiqError(e)); }
assert.throws(() => fromJSONSchema({ tpye: 'string' }), JSONSchemaError);
console.log('cjs ok');
`;
const ts = `
import { v, type Infer } from 'valiq-js';
import { fromJSONSchema } from 'valiq-js/json-schema';
const User = v.object({ id: v.string(), tags: v.array(v.string()).optional() });
type User = Infer<typeof User>;
const user: User = { id: 'a' };
const Product = fromJSONSchema({ type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] } as const);
const sku: string = Product.parse({ sku: 'x' }).sku;
// @ts-expect-error -- id must be a string
const wrong: User = { id: 1 };
export { user, sku, wrong };
`;
await writeFile(resolve(app, 'esm.mjs'), esm);
await writeFile(resolve(app, 'cjs.cjs'), cjs);
await writeFile(resolve(app, 'types.mts'), ts);
await writeFile(resolve(app, 'types.cts'), ts.replace(/import \{ (.+) \} from '(.+)';/g, "import { $1 } from '$2';"));
process.stdout.write(run(process.execPath, ['esm.mjs'], app));
process.stdout.write(run(process.execPath, ['cjs.cjs'], app));

const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
await writeFile(resolve(app, 'bundler.ts'), ts);
const configs = {
  'tsconfig.node16.json': { module: 'node16', moduleResolution: 'node16', files: ['types.mts', 'types.cts'] },
  'tsconfig.bundler.json': { module: 'esnext', moduleResolution: 'bundler', files: ['bundler.ts'] },
};
for (const [name, { files, ...options }] of Object.entries(configs)) {
  const compilerOptions = {
    ...options,
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
  };
  await writeFile(resolve(app, name), JSON.stringify({ compilerOptions, files }));
  run(process.execPath, [tsc, '-p', name], app);
  console.log(`types ok (${options.moduleResolution})`);
}
await rm(dir, { recursive: true, force: true });
console.log(`✓ smoke test passed for ${tarball}`);

// Measures what Valiq adds to a browser bundle (minified + gzip) for typical imports, by bundling
// small entry files against dist/ with rolldown. Run after `npm run build`.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

const root = resolve(import.meta.dirname, '..');
const tmp = resolve(root, '.size');
const cases = {
  'v.string() only': `import { v } from 'valiq'; export const s = v.string().min(1);`,
  'object + string/number/array': `import { v } from 'valiq'; export const s = v.object({ a: v.string().email(), b: v.number().int(), c: v.array(v.boolean()) });`,
  'everything from "valiq"': `export * from 'valiq';`,
  fromJSONSchema: `import { fromJSONSchema } from 'valiq/json-schema'; export const s = fromJSONSchema({ type: 'string' });`,
  'everything (both entry points)': `export * from 'valiq'; export * from 'valiq/json-schema';`,
};
// Regression budgets (bytes, min+gzip).
const limits = { 'everything from "valiq"': 12_500, 'everything (both entry points)': 18_500 };
// `--compare` adds equivalent entries for other libraries, for the docs.
if (process.argv.includes('--compare')) {
  Object.assign(cases, {
    'ajv: new Ajv().compile()': `import Ajv from 'ajv'; export const f = new Ajv().compile({ type: 'string' });`,
    'zod: z.object + string/number/array': `import * as z from 'zod'; export const s = z.object({ a: z.email(), b: z.int(), c: z.array(z.boolean()) });`,
    'zod/mini: same': `import * as z from 'zod/mini'; export const s = z.object({ a: z.email(), b: z.int(), c: z.array(z.boolean()) });`,
    'valibot: same': `import * as v from 'valibot'; export const s = v.object({ a: v.pipe(v.string(), v.email()), b: v.pipe(v.number(), v.integer()), c: v.array(v.boolean()) });`,
  });
}

await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
const rows = [];
let failed = false;
for (const [name, code] of Object.entries(cases)) {
  const file = resolve(root, `.size/${rows.length}.js`);
  await writeFile(file, code);
  const bundle = await rolldown({
    input: file,
    platform: 'browser',
    resolve: {
      alias: { 'valiq/json-schema': resolve(root, 'dist/json-schema/index.js'), valiq: resolve(root, 'dist/index.js') },
    },
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  const min = Buffer.byteLength(output[0].code);
  const gz = gzipSync(output[0].code, { level: 9 }).length;
  if (limits[name] !== undefined && gz > limits[name]) failed = true;
  rows.push({ import: name, 'min (KB)': +(min / 1024).toFixed(1), 'min+gzip (KB)': +(gz / 1024).toFixed(1) });
}
await rm(tmp, { recursive: true, force: true });
console.table(rows);
if (failed) {
  console.error('Bundle size limit exceeded');
  process.exit(1);
}

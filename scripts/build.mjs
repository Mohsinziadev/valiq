// Builds dist/:
//   ESM  — emitted by tsc file-by-file, so `export * as v` stays a static namespace that bundlers
//          can tree-shake, with a .d.ts next to every module.
//   CJS  — bundled by rolldown with the same file layout, with .d.cts copies of the declarations.
// Entry points: "valiq-js" (dist/index) and "valiq-js/json-schema" (dist/json-schema/index).
import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rolldown } from 'rolldown';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });

execFileSync(
  process.execPath,
  [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.build.json')],
  {
    stdio: 'inherit',
  },
);

const bundle = await rolldown({
  input: { index: resolve(root, 'src/index.ts'), 'json-schema/index': resolve(root, 'src/json-schema/index.ts') },
  platform: 'neutral',
  treeshake: true,
  transform: { target: 'es2022' },
});
await bundle.write({
  dir: dist,
  format: 'cjs',
  preserveModules: true,
  preserveModulesRoot: 'src',
  entryFileNames: '[name].cjs',
  sourcemap: false,
  exports: 'named',
});
await bundle.close();

// tsc keeps the source's `.ts` specifiers in declarations; point them at the emitted `.js`. CJS
// consumers resolve .d.cts next to .cjs, and those imports must target .cjs, or TypeScript would
// treat the shared declarations as ESM.
const relative = /((?:from|import)\s*\(?\s*["']\.{1,2}\/[^"']+)\.ts(["'])/g;
const files = await readdir(dist, { recursive: true });
for (const file of files.filter((f) => f.endsWith('.d.ts'))) {
  const path = resolve(dist, file);
  const code = await readFile(path, 'utf8');
  await writeFile(path, code.replace(relative, '$1.js$2'));
  await writeFile(path.replace(/\.d\.ts$/, '.d.cts'), code.replace(relative, '$1.cjs$2'));
}
console.log('✓ built dist (esm + d.ts via tsc, cjs + d.cts via rolldown)');

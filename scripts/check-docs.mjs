// Type-checks every ```ts code block in README.md and docs/*.md against the sources, so the
// documentation cannot drift from the API. Blocks in other languages (tsx, js, json) are skipped.
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '.docs-check');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const sources = [
  'README.md',
  ...(await readdir(resolve(root, 'docs'))).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
];
const files = [];
for (const source of sources) {
  const text = await readFile(resolve(root, source), 'utf8');
  let index = 0;
  for (const match of text.matchAll(/```ts\n([\s\S]*?)```/g)) {
    const name = `${source.replace(/[/.]/g, '_')}_${++index}.ts`;
    // Each block is its own module; `export {}` keeps top-level names from clashing.
    await writeFile(resolve(out, name), `${match[1]}\nexport {};\n`);
    files.push(name);
  }
}

await writeFile(
  resolve(out, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'DOM'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      types: [],
      paths: { valiq: ['../src/index.ts'], 'valiq/json-schema': ['../src/json-schema/index.ts'] },
    },
    files,
  }),
);
try {
  execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(out, 'tsconfig.json')],
    {
      stdio: 'pipe',
    },
  );
  console.log(`✓ ${files.length} documentation code blocks type-check`);
  await rm(out, { recursive: true, force: true });
} catch (error) {
  console.error(String(error.stdout));
  console.error(`Documentation code blocks failed to type-check (see ${out})`);
  process.exit(1);
}

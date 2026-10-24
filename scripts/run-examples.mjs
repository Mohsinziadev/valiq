// Runs every example against the built package (node resolves "valiq" to this package itself).
// Each example asserts its own results, so a non-zero exit means the docs are out of date.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../examples');
let failed = 0;
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .sort()) {
  try {
    execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', resolve(dir, file)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    console.log(`✓ ${file}`);
  } catch (error) {
    failed++;
    console.error(`✖ ${file}\n${error.stderr}`);
  }
}
process.exit(failed === 0 ? 0 : 1);

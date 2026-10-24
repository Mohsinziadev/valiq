import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, vi } from 'vitest';

// Every example asserts its own results with node:assert; importing it runs those assertions.
const dir = join(import.meta.dirname, '../examples');
describe('examples', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    it(file, async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      await import(join(dir, file));
    });
  }
});

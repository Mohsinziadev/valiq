import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Examples import the package by name; tests run them against the sources.
    alias: [
      { find: /^valiq-js\/json-schema$/, replacement: src('json-schema/index.ts') },
      { find: /^valiq-js$/, replacement: src('index.ts') },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});

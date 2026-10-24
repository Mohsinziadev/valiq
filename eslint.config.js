import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.scratch', '.smoke', 'tests/fixtures']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals['shared-node-browser'] },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Type tests declare values only to inspect their types.
    files: ['type-tests/**/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-empty-object-type': 'off' },
  },
  {
    // Examples are copied into user apps; logging there is intentional.
    files: ['examples/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['scripts/**/*.{mjs,ts}', 'benchmarks/**/*.{mjs,ts}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
]);

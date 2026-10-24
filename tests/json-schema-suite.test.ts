import { describe, expect, it } from 'vitest';
import { DRAFTS, files, runFile, UNSUPPORTED_FILES } from './conformance';

// Valiq asserts `format` by default (like most validators in practice). The 2020-12 suite's
// format.json checks the spec default, where `format` is annotation-only; it is run with
// `formats: "annotate"` in that mode instead (see runFile).
describe.each(DRAFTS)('JSON-Schema-Test-Suite $dir', ({ dir, draft }) => {
  for (const file of files(dir)) {
    it(file, () => {
      const results = runFile(dir, draft, file);
      const failures = results.filter((r) => r.status === 'fail').map((r) => `${r.group} / ${r.test}: ${r.reason}`);
      expect(failures).toEqual([]);
      if (!UNSUPPORTED_FILES.has(file)) {
        // Outside the unsupported files, only metaschema references and tests that rely on
        // unevaluated* or $recursive* keywords may be skipped.
        const skipped = results.filter((r) => r.status === 'unsupported');
        for (const r of skipped) expect(r.reason).toMatch(/json-schema\.org|unevaluated|\$recursive/);
      }
    });
  }
});

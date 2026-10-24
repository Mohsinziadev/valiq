// Prints JSON-Schema-Test-Suite results per draft (required suite + optional formats).
// Usage: npm run conformance
import { DRAFTS, files, runFile, type CaseResult } from '../tests/conformance.ts';

function tally(results: CaseResult[]) {
  return {
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    unsupported: results.filter((r) => r.status === 'unsupported').length,
  };
}

console.log('| Suite | Passed | Failed | Skipped (unsupported) |');
console.log('| --- | ---: | ---: | ---: |');
for (const { dir, draft } of DRAFTS) {
  const required = files(dir).flatMap((file) => runFile(dir, draft, file));
  const optional = files(dir, true).flatMap((file) => runFile(dir, draft, file, true));
  const r = tally(required);
  const o = tally(optional);
  console.log(`| ${dir} (required) | ${r.pass} | ${r.fail} | ${r.unsupported} |`);
  console.log(`| ${dir} optional/format | ${o.pass} | ${o.fail + o.unsupported} | — |`);
  if (process.argv.includes('--verbose')) {
    for (const f of [...required, ...optional].filter((x) => x.status === 'fail')) {
      console.log(`  ✖ ${f.file} › ${f.group} › ${f.test}`);
    }
  }
}

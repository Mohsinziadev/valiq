// Runs the official JSON-Schema-Test-Suite (vendored in tests/fixtures) against fromJSONSchema.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fromJSONSchema, JSONSchemaError, type Draft, type JSONSchemaDocument } from '../src/json-schema/index.ts';

const SUITE = join(import.meta.dirname, 'fixtures/json-schema-test-suite');

export const DRAFTS: { dir: string; draft: Draft }[] = [
  { dir: 'draft2020-12', draft: '2020-12' },
  { dir: 'draft2019-09', draft: '2019-09' },
  { dir: 'draft7', draft: 'draft-07' },
];

/** Whole files covering keywords valiq-js does not implement yet (they throw JSONSchemaError). */
export const UNSUPPORTED_FILES = new Set([
  'unevaluatedItems.json',
  'unevaluatedProperties.json',
  'dynamicRef.json',
  'recursiveRef.json',
  'vocabulary.json',
]);

interface TestCase {
  description: string;
  data: unknown;
  valid: boolean;
}
interface Group {
  description: string;
  schema: JSONSchemaDocument;
  tests: TestCase[];
}

export interface CaseResult {
  file: string;
  group: string;
  test: string;
  status: 'pass' | 'fail' | 'unsupported';
  reason?: string | undefined;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name.endsWith('.json') ? [full] : [];
  });
}

let remotes: Record<string, JSONSchemaDocument> | undefined;
function loadRemotes(): Record<string, JSONSchemaDocument> {
  if (remotes) return remotes;
  remotes = {};
  const root = join(SUITE, 'remotes');
  for (const file of walk(root)) {
    remotes[`http://localhost:1234/${relative(root, file).split('\\').join('/')}`] = JSON.parse(
      readFileSync(file, 'utf8'),
    );
  }
  return remotes;
}

/** True for compile errors that reflect a documented limitation rather than a bug. */
function isLimitation(error: unknown): boolean {
  return (
    error instanceof JSONSchemaError &&
    (/not supported/.test(error.message) || /Cannot resolve \$ref "https?:\/\/json-schema\.org\//.test(error.message))
  );
}

export function files(draftDir: string, optional = false): string[] {
  const dir = join(SUITE, draftDir, optional ? 'optional/format' : '');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => (optional ? `format/${name}` : name))
    .sort();
}

export function runFile(draftDir: string, draft: Draft, file: string, optional = false): CaseResult[] {
  const groups = JSON.parse(readFileSync(join(SUITE, draftDir, optional ? 'optional' : '', file), 'utf8')) as Group[];
  const results: CaseResult[] = [];
  for (const group of groups) {
    let validator: ReturnType<typeof fromJSONSchema> | undefined;
    let compileError: unknown;
    try {
      // format.json (required suite) tests the spec default: format is an annotation only.
      const formats = !optional && file === 'format.json' && draft !== 'draft-07' ? 'annotate' : 'assert';
      validator = fromJSONSchema(group.schema, { draft, strict: false, formats, schemas: loadRemotes() });
    } catch (error) {
      compileError = error;
    }
    for (const test of group.tests) {
      const base = { file, group: group.description, test: test.description };
      if (validator === undefined) {
        results.push({
          ...base,
          status: UNSUPPORTED_FILES.has(file) || isLimitation(compileError) ? 'unsupported' : 'fail',
          reason: String((compileError as Error).message),
        });
        continue;
      }
      const is = validator.is(test.data);
      const parsed = validator.safeParse(test.data).success;
      const ok = is === test.valid && parsed === test.valid;
      results.push({
        ...base,
        status: ok ? 'pass' : UNSUPPORTED_FILES.has(file) ? 'unsupported' : 'fail',
        reason: ok ? undefined : `expected valid=${test.valid}, is()=${is}, safeParse()=${parsed}`,
      });
    }
  }
  return results;
}

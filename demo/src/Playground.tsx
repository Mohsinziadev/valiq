import { useMemo, useState } from 'react';
import { formatPath, type AnySchema, type Issue, type SafeParseResult } from 'valiq-js';
import { fromJSONSchema, type JSONSchemaDocument } from 'valiq-js/json-schema';
import { CreateOrder } from '../snippets/playground/order';
import { Env } from '../snippets/playground/env';
import { Signup } from '../snippets/playground/signup';
import { Snippet } from './Snippet';
import { docHref } from './router';

const json = (value: unknown) => JSON.stringify(value, null, 2);

type Preset = { id: string; label: string; file?: string; schema?: AnySchema; input: unknown; note: string };

/** Each builder preset runs the exact file it displays (demo/snippets/playground/*.ts). */
const PRESETS: Preset[] = [
  {
    id: 'signup',
    label: 'Signup form',
    file: 'playground/signup',
    schema: Signup,
    input: { name: ' A ', email: 'ADA@example', password: 'hunter2', confirm: 'hunter2', age: 17.5 },
    note: 'Fix every field and the cross-field refine runs: make confirm differ from password to see it.',
  },
  {
    id: 'order',
    label: 'API request',
    file: 'playground/order',
    schema: CreateOrder,
    input: {
      customerId: 'not-a-uuid',
      items: [{ sku: 'abc-12', quantity: 0 }],
      delivery: { method: 'courier', address: '1' },
      total: 999,
    },
    note: 'Unknown keys like "total" are dropped by .strip(). The union picks its branch from "method".',
  },
  {
    id: 'env',
    label: 'Environment',
    file: 'playground/env',
    schema: Env,
    input: {
      NODE_ENV: 'staging',
      PORT: '80800',
      DATABASE_URL: 'postgres://localhost:5432/app',
      DEBUG: 'yes',
      ALLOWED_ORIGINS: 'https://app.example.com,example.com',
    },
    note: 'v.coerce converts strings strictly: "true" and "1" become true, but "yes" is an error.',
  },
  {
    id: 'json-schema',
    label: 'JSON Schema',
    input: { sku: 'abc-12', price: 0, tags: ['new', 'new'], color: 'red' },
    note: 'Edit the schema too. Misspell a keyword (try "maxItem") and fromJSONSchema refuses to compile it.',
  },
];

const DEFAULT_JSON_SCHEMA = json({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
    price: { type: 'number', exclusiveMinimum: 0 },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true, maxItems: 5 },
  },
  required: ['sku', 'price'],
  additionalProperties: false,
});

type Outcome =
  | { kind: 'input-error'; message: string }
  | { kind: 'schema-error'; message: string }
  | { kind: 'result'; result: SafeParseResult<unknown> };

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/** The constraint fields of an issue (everything except code, path and message). */
const params = (issue: Issue) =>
  Object.entries(issue)
    .filter(([k]) => !['code', 'path', 'message'].includes(k))
    .map(([k, value]) => `${k}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

export function Playground() {
  const [presetId, setPresetId] = useState(PRESETS[0]!.id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(PRESETS.map((p) => [p.id, json(p.input)])),
  );
  const [schemaText, setSchemaText] = useState(DEFAULT_JSON_SCHEMA);
  const [view, setView] = useState<'issues' | 'format' | 'output'>('issues');
  const input = inputs[preset.id]!;

  const outcome = useMemo<Outcome>(() => {
    let schema = preset.schema;
    if (!schema) {
      const parsed = parseJson(schemaText);
      if (!parsed.ok) return { kind: 'schema-error', message: `Schema is not valid JSON: ${parsed.message}` };
      try {
        schema = fromJSONSchema(parsed.value as JSONSchemaDocument);
      } catch (error) {
        return { kind: 'schema-error', message: `${(error as Error).name}: ${(error as Error).message}` };
      }
    }
    const data = parseJson(input);
    if (!data.ok) return { kind: 'input-error', message: `Input is not valid JSON: ${data.message}` };
    return { kind: 'result', result: schema.safeParse(data.value) };
  }, [preset, schemaText, input]);

  const result = outcome.kind === 'result' ? outcome.result : null;
  const issues = result && !result.success ? result.error.issues : [];
  const activeView = result?.success && view !== 'output' ? 'output' : view;

  return (
    <section className="playground" id="playground" aria-labelledby="playground-title">
      <div className="section-head">
        <p className="eyebrow eyebrow-brand">Playground</p>
        <h2 id="playground-title" className="section-title">
          Try it live. Edit the input, watch the issues.
        </h2>
        <p className="section-lead">
          Every result below is computed in your browser by the same valiq-js source this page documents. Nothing is
          mocked.
        </p>
      </div>

      <div className="pg-tabs" role="tablist" aria-label="Example schema">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === preset.id}
            onClick={() => setPresetId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        <div className="pg-panel">
          <div className="pg-head">
            <span>Schema</span>
            <span className="pg-file">{preset.file ? `${preset.file.split('/')[1]}.ts` : 'schema.json'}</span>
          </div>
          {preset.file ? (
            <Snippet name={preset.file} className="pg-code" />
          ) : (
            <textarea
              className="pg-editor"
              spellCheck={false}
              aria-label="JSON Schema"
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
            />
          )}
        </div>

        <div className="pg-panel">
          <div className="pg-head">
            <span>Input</span>
            <button
              type="button"
              className="pg-reset"
              onClick={() => {
                setInputs((all) => ({ ...all, [preset.id]: json(preset.input) }));
                if (!preset.schema) setSchemaText(DEFAULT_JSON_SCHEMA);
              }}
            >
              Reset
            </button>
          </div>
          <textarea
            className="pg-editor"
            spellCheck={false}
            aria-label="Input JSON"
            value={input}
            onChange={(e) => setInputs((all) => ({ ...all, [preset.id]: e.target.value }))}
          />
        </div>

        <div className="pg-panel pg-result" aria-live="polite">
          <div className="pg-head">
            {result ? (
              result.success ? (
                <span className="pg-status pg-pass">✓ Valid</span>
              ) : (
                <span className="pg-status pg-fail">
                  ✗ {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
                </span>
              )
            ) : (
              <span className="pg-status pg-fail">✗ Error</span>
            )}
            {result && (
              <div className="pg-views" role="tablist" aria-label="Result view">
                {(['issues', 'format', 'output'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={activeView === v}
                    disabled={result.success && v !== 'output'}
                    onClick={() => setView(v)}
                  >
                    {v === 'format' ? 'format()' : v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="pg-body">
            {outcome.kind !== 'result' ? (
              <p className="pg-error">{outcome.message}</p>
            ) : result!.success || activeView === 'output' ? (
              <pre className="pg-pre">
                {result!.success
                  ? json(result!.data)
                  : '// safeParse returned { success: false }\n// fix the issues to see the parsed output'}
              </pre>
            ) : activeView === 'format' ? (
              <pre className="pg-pre">{result!.error.format()}</pre>
            ) : (
              <ul className="pg-issues">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <div className="pg-issue-top">
                      <code className="pg-code-badge">{issue.code}</code>
                      <code className="pg-path">{issue.path.length ? formatPath(issue.path) : '(root)'}</code>
                    </div>
                    <p>{issue.message}</p>
                    {params(issue).length > 0 && <p className="pg-params">{params(issue).join(' · ')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <p className="pg-note">
        {preset.note} <a href={docHref('errors')}>Read about issues →</a>
      </p>
    </section>
  );
}

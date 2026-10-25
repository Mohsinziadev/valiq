# Errors

## The issue object

Failed validation produces a list of issues. Each issue is a plain, JSON-serialisable object:

```ts
interface IssueBase {
  code: string; // stable identifier, see the table below
  path: (string | number)[]; // where the failing value is, from the root; [] for the root itself
  message: string; // human-readable, never contains the input value
  keyword?: string; // JSON Schema validators only: the failing keyword, e.g. "minLength"
  schemaPath?: string; // JSON Schema validators only: JSON Pointer to it, e.g. "#/properties/name/minLength"
}
```

The `Issue` type is a discriminated union on `code`, so checking the code narrows the extra fields:

```ts
import { v, type Issue } from 'valiq-js';

function describe(issue: Issue): string {
  if (issue.code === 'too_small') return `needs ${issue.minimum}`; // minimum is typed
  return issue.message;
}

const issues = v.string().min(3).safeParse('a').error?.issues ?? [];
issues.map(describe); // ['needs 3']
```

## Issue codes

The codes and their fields are part of the public API and follow semver.

| Code                | Meaning                                                      | Extra fields                                                                                           |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `invalid_type`      | wrong type                                                   | `expected`, `received` (type names, e.g. `'string'`, `'NaN'`, `'array'`)                               |
| `required`          | a required property is missing or `undefined`                | —                                                                                                      |
| `invalid_value`     | not one of the allowed literal/enum/const values             | `values`                                                                                               |
| `too_small`         | below a minimum                                              | `origin` (`string`, `number`, `array`, `object`, `date`, `contains`), `minimum`, `inclusive`, `exact?` |
| `too_big`           | above a maximum                                              | `origin`, `maximum`, `inclusive`, `exact?`                                                             |
| `not_multiple_of`   | not a multiple                                               | `divisor`                                                                                              |
| `invalid_format`    | a named string format failed                                 | `format` (e.g. `email`, `uuid`, `date-time`)                                                           |
| `invalid_pattern`   | a regular expression did not match                           | `pattern` (the source)                                                                                 |
| `unrecognized_keys` | strict object / `additionalProperties: false` got extra keys | `keys` (at most 100)                                                                                   |
| `invalid_key`       | a record key or JSON Schema `propertyNames` failed           | `issues` (about the key; paths relative to it)                                                         |
| `invalid_union`     | no union member matched (or several matched a `oneOf`)       | `branches` (issues per member), `matched?`                                                             |
| `not_unique`        | two array items are equal                                    | `indexes`                                                                                              |
| `forbidden`         | JSON Schema `false` or `not` rejected the value              | —                                                                                                      |
| `too_deep`          | recursion exceeded `maxDepth`                                | `maxDepth`                                                                                             |
| `custom`            | `.refine()` or `v.custom()` failed                           | `params?`                                                                                              |

Notes:

- `invalid_type` uses `expected: 'integer'` for `.int()` and JSON Schema `"type": "integer"`.
- `received` reports `'NaN'` and `'Infinity'` separately from `'number'`, and `'Date'` for dates.
- Issues are never deduplicated: a value that fails `min(3)` and `email()` gets two issues.

## Paths

Paths are arrays of keys and indexes, so they are unambiguous even for keys containing dots.
`formatPath` turns them into JavaScript notation:

```ts
import { formatPath } from 'valiq-js';

formatPath(['items', 0, 'sku']); // 'items[0].sku'
formatPath(['headers', 'content-type']); // 'headers["content-type"]'
formatPath([]); // ''
```

## ValiqError

`parse()` throws, and `safeParse()` returns, a `ValiqError`:

```ts
import { isValiqError, v } from 'valiq-js';

const Age = v.number().int().min(0);

try {
  Age.parse(-1);
} catch (error) {
  if (isValiqError(error)) {
    error.issues; // Issue[]
    error.message; // 'Validation failed: Expected a number greater than or equal to 0'
    error.flatten(); // { root: ['Expected a number greater than or equal to 0'], fields: {} }
    error.format(); // '✖ Expected a number greater than or equal to 0'
  }
}
```

- `message` summarises the first three issues with their paths.
- `flatten()` returns `{ root: string[]; fields: Record<string, string[]> }`. `root` holds issues
  about the value itself; `fields` is keyed by `formatPath(issue.path)` (the object has no
  prototype, so keys such as `__proto__` are safe).
- `format()` returns a multi-line report with `✖ message` and `→ at path` lines.
- `isValiqError(error)` also recognises errors from another copy of valiq-js (for example two
  versions in one `node_modules`).

`safeParse` creates its error without a stack trace, because it is returned rather than thrown;
errors thrown by `parse` have normal stack traces.

## Custom messages

Per check, as a string or a function of the issue:

```ts
import { v } from 'valiq-js';

const Username = v
  .string({ message: 'Username must be text' })
  .min(3, 'At least 3 characters')
  .max(20, { message: (issue) => (issue.code === 'too_big' ? `At most ${issue.maximum} characters` : 'Too long') });
void Username;
```

## Localisation

Pass `messages` to translate default messages. It is called for every issue that has no
per-check message; return `undefined` to keep the default:

```ts
import { v, type Issue } from 'valiq-js';

const de = (issue: Issue): string | undefined => {
  switch (issue.code) {
    case 'required':
      return 'Pflichtfeld';
    case 'too_small':
      return issue.origin === 'string' ? `Mindestens ${issue.minimum} Zeichen` : undefined;
    default:
      return undefined;
  }
};

const Form = v.object({ name: v.string().min(2) });
Form.safeParse({}, { messages: de }); // message: 'Pflichtfeld'
```

`defaultMessage(issue)` returns the built-in English message if you want to fall back to it
yourself.

## Sensitive data

Messages and issue fields describe the schema and the type of the value, never the value itself,
so `ValiqError` messages and issue lists can be logged without leaking passwords or tokens. The
exceptions are things that come from the input's structure: object keys (in `path` and in
`unrecognized_keys.keys`) and array indexes. If your keys can be sensitive (for example a record
keyed by email address), filter `path` before logging.

## API responses

Issues are designed to be returned to clients as they are:

```ts
import { v } from 'valiq-js';

const Body = v.object({ email: v.string().email() }).strict();

function handle(body: unknown): { status: number; json: unknown } {
  const result = Body.safeParse(body);
  if (!result.success) return { status: 400, json: { issues: result.error.issues } };
  return { status: 200, json: { ok: true } };
}
void handle;
```

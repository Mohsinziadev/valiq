# valiq-js

**Modern validation. Precise errors. Type-safe by design.**

[Documentation and live playground](https://www.m2toolkit.com/npm-packages/valiq-js)

valiq-js is a TypeScript-first validation library for JavaScript and TypeScript. You describe your data
once and get a runtime validator, an inferred TypeScript type, structured errors that are safe to
send to clients or write to logs, and JSON Schema in both directions.

```ts
import { v, type Infer } from 'valiq-js';

const User = v.object({
  id: v.string().uuid(),
  email: v.string().email(),
  age: v.number().int().min(18),
  roles: v.array(v.enum(['admin', 'editor', 'viewer'])).default(['viewer']),
});

type User = Infer<typeof User>;
// { id: string; email: string; age: number; roles: ("admin" | "editor" | "viewer")[] }

const result = User.safeParse({ id: '7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a', email: 'nope', age: 30 });
if (result.success) {
  const user: User = result.data; // roles defaults to ['viewer']
} else {
  console.log(result.error.issues);
  // [{ code: 'invalid_format', path: ['email'], message: 'Invalid email address', format: 'email' }, ...]
}
```

## Why valiq-js

- **One library for TypeScript schemas and JSON Schema.** Build schemas in TypeScript, or compile
  existing JSON Schema documents (2020-12, 2019-09, draft-07) with
  [`fromJSONSchema`](docs/json-schema.md). Both produce the same kind of schema with the same API,
  and they nest inside each other. Export any schema with `toJSONSchema` for OpenAPI or other
  services.
- **Errors you can act on.** Every issue has a stable `code`, the exact `path`, a readable
  `message` and the constraint that failed (`minimum`, `format`, `keys`...). Messages never contain
  the submitted value, so issues are safe to log or return in an API response. JSON Schema issues
  also carry `keyword` and `schemaPath`.
- **Strict about schemas.** In JSON Schema mode, `{ "maxLenght": 10 }` throws
  `Unknown keyword "maxLenght" (did you mean "maxLength"?)` at startup instead of silently
  accepting everything.
- **Strong type inference.** Optional keys, defaults (input and output types differ), unions,
  tuples, records, brands, transforms, and JSON Schema literals declared `as const` are all inferred.
- **Validation, not hidden transformation.** Valid input is returned as the same object. Nothing
  is coerced, copied or stripped unless you ask for it (`v.coerce.*`, `.default()`, `.strip()`,
  `.transform()`). Input is never mutated.
- **Safe by default.** Resistant to prototype pollution and ReDoS in built-in formats, with
  resource limits for recursion depth, issue count and oversized arrays. No `eval` or
  `new Function`, so it works under a strict Content Security Policy.
- **Works with your stack.** Implements [Standard Schema](https://standardschema.dev) and Standard
  JSON Schema, so libraries that accept Standard Schema (such as tRPC, TanStack Form, React Hook
  Form's Standard Schema resolver and Hono's standard validator) accept valiq-js schemas directly.
- **Zero dependencies.** ESM and CommonJS, Node.js 18+ and modern browsers. About 9 KB min+gzip for
  typical builder usage.

valiq-js does not try to beat Ajv at raw throughput: Ajv generates code and is about 3× faster on
valid data. See [Performance](#performance) for measured numbers.

## Installation

```sh
npm install valiq-js
```

Requirements: Node.js 18 or later, or any modern browser (ES2022). TypeScript 5.0+ is recommended
for inference; `strict` mode is expected.

## Quick start

```ts
import { v } from 'valiq-js';

const Signup = v.object({
  name: v.string().trim().min(2),
  email: v.string().trim().toLowerCase().email(),
  password: v.string().min(12),
  newsletter: v.boolean().default(false),
});

// parse(): returns the data or throws a ValiqError
const signup = Signup.parse({ name: ' Ada ', email: 'ADA@example.com', password: 'correct horse battery' });
// { name: 'Ada', email: 'ada@example.com', password: '...', newsletter: false }

// safeParse(): never throws for invalid data
const result = Signup.safeParse({ name: 'A' });
if (!result.success) {
  result.error.flatten().fields;
  // { name: ['Expected at least 2 characters'], email: ['Required'], password: ['Required'] }
}

// is(): a fast type guard when you only need yes or no
const payload: unknown = { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' };
if (Signup.is(payload)) {
  payload.email; // narrowed
}
```

## Core API

| Schema                                                      | Accepts                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `v.string()`                                                | strings; `min`, `max`, `length` (code points), `regex`, formats                                                             |
| `v.number()`                                                | finite numbers; `int`, `min`, `max`, `gt`, `lt`, `multipleOf`                                                               |
| `v.boolean()`, `v.null()`, `v.undefined()`                  | that exact type                                                                                                             |
| `v.date()`                                                  | valid `Date` instances; `min`, `max`                                                                                        |
| `v.literal(x)`, `v.enum([...])`                             | one fixed value / one of several (also accepts TypeScript enums)                                                            |
| `v.object({...})`                                           | objects; `.strict()`, `.strip()`, `.catchall()`, `.extend()`, `.pick()`, `.omit()`, `.partial()`, `.required()`, `.keyof()` |
| `v.array(item)`, `v.tuple([...])`                           | arrays; `min`, `max`, `length`, `unique` / fixed positions, `.rest()`                                                       |
| `v.record(key, value)`                                      | dictionaries with validated keys and values                                                                                 |
| `v.union([...])`, `v.intersection([...])`                   | any one / all of several schemas                                                                                            |
| `v.lazy(() => schema)`                                      | recursive structures                                                                                                        |
| `v.unknown()`, `v.never()`, `v.instance(C)`, `v.custom(fn)` | escape hatches                                                                                                              |
| `v.coerce.number()`, `.boolean()`, `.date()`                | explicit, strict conversion from strings                                                                                    |

Every schema has `parse`, `safeParse`, `is`, `optional`, `nullable`, `nullish`, `default`,
`refine`, `transform`, `pipe`, `brand` and `meta`. Schemas are immutable: each method returns a
new schema. See the [API reference](docs/api.md).

String formats: `email`, `url` (http/https by default), `uuid`, `ipv4`, `ipv6`, `hostname`,
`isoDate`, `isoTime`, `isoDateTime`, plus `startsWith`, `endsWith`, `includes`, and the transforms
`trim`, `toLowerCase` and `toUpperCase`. The exact rules are in [docs/schemas.md](docs/schemas.md#string-formats).

## TypeScript inference

```ts
import { v, type Infer, type Input } from 'valiq-js';

const Settings = v.object({
  theme: v.enum(['light', 'dark']).default('light'),
  fontSize: v.number().int().min(8).optional(),
  shortcuts: v.record(v.string(), v.string()),
});

type Settings = Infer<typeof Settings>;
// { theme: 'light' | 'dark'; shortcuts: Record<string, string>; fontSize?: number | undefined }

type SettingsInput = Input<typeof Settings>;
// { shortcuts: Record<string, string>; theme?: 'light' | 'dark' | undefined; fontSize?: number | undefined }
```

Discriminated unions narrow as expected, brands give you nominal IDs
(`v.string().uuid().brand<'UserId'>()`), and recursive schemas use `v.lazy` with an explicit
annotation. See [docs/typescript.md](docs/typescript.md).

## Errors

```ts
import { v } from 'valiq-js';

const Order = v.object({
  items: v.array(v.object({ sku: v.string().min(3), qty: v.number().int().min(1) })).min(1),
});

const result = Order.safeParse({ items: [{ sku: 'AB', qty: 0 }] });
if (!result.success) {
  result.error.issues;
  // [
  //   { code: 'too_small', path: ['items', 0, 'sku'], message: 'Expected at least 3 characters',
  //     origin: 'string', minimum: 3, inclusive: true },
  //   { code: 'too_small', path: ['items', 0, 'qty'], message: 'Expected a number greater than or equal to 1',
  //     origin: 'number', minimum: 1, inclusive: true },
  // ]
  result.error.format();
  // ✖ Expected at least 3 characters
  //   → at items[0].sku
  // ✖ Expected a number greater than or equal to 1
  //   → at items[0].qty
}
```

Issue codes: `invalid_type`, `required`, `invalid_value`, `too_small`, `too_big`,
`not_multiple_of`, `invalid_format`, `invalid_pattern`, `unrecognized_keys`, `invalid_key`,
`invalid_union`, `not_unique`, `forbidden`, `too_deep`, `custom`. Messages can be customised per
check (`.min(3, 'Too short')`) or globally for localisation (`safeParse(data, { messages })`). See
[docs/errors.md](docs/errors.md).

## JSON Schema

```ts
import { fromJSONSchema } from 'valiq-js/json-schema';

const Product = fromJSONSchema({
  type: 'object',
  properties: {
    sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
    price: { type: 'number', minimum: 0 },
  },
  required: ['sku', 'price'],
  additionalProperties: false,
} as const);

Product.parse({ sku: 'ABC-1234', price: 10 }); // typed { sku: string; price: number }
```

Supported: draft 2020-12, 2019-09 and draft-07, including `$ref` (local, `$id`, `$anchor`,
recursive, and pre-registered schemas through the `schemas` option), all composition keywords,
`if`/`then`/`else`, dependencies, `contains` with min/max, and 15 formats. Against the official
[JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite), valiq-js passes
**every test it runs** in the required suites: 1052 for 2020-12, 1032 for 2019-09 and 925 for
draft-07.

**Not supported yet:** `unevaluatedProperties`, `unevaluatedItems`, `$dynamicRef` and
`$recursiveRef` (schemas using them throw `JSONSchemaError` instead of being half-applied), and
the internationalised formats (`idn-email`, `idn-hostname`, `iri`, `iri-reference`). Remote
schemas are never fetched. Full details, options and the conformance table are in
[docs/json-schema.md](docs/json-schema.md).

`toJSONSchema(schema)` exports builder schemas to 2020-12 or draft-07. The output is checked
against Ajv in the test suite.

## Custom validation

```ts
import { v } from 'valiq-js';

const Password = v
  .string()
  .min(12)
  .refine((s) => /[0-9]/.test(s), 'Include at least one digit');

const Signup = v
  .object({ password: Password, confirm: v.string() })
  .refine((form) => form.password === form.confirm, { message: 'Passwords do not match', path: ['confirm'] });

const Amount = v
  .string()
  .transform((text) => Number(text.replaceAll(',', '')))
  .pipe(v.number().min(0));
```

## Node.js, browsers and frameworks

valiq-js has no dependencies and uses only standard JavaScript APIs (no Node.js built-ins), so it
runs in Node.js and browsers and should run unchanged in Deno, Bun and edge runtimes (only Node.js
is covered by the test suite today). It ships ESM and CommonJS builds with type declarations for
both.

```ts
// Any library that accepts a Standard Schema accepts a valiq-js schema:
import { v } from 'valiq-js';
const Login = v.object({ email: v.string().email(), password: v.string().min(8) });
const result = await Login['~standard'].validate({ email: 'dev@example.com', password: 'hunter22!' });
```

Working examples: [API request](examples/api-request.ts), [environment config](examples/env-config.ts),
[registration form](examples/registration-form.ts), [nested JSON](examples/nested-json.ts),
[JSON Schema](examples/json-schema.ts), [custom validators](examples/custom-validators.ts),
[schema reuse](examples/compiled-reuse.ts) and [Standard Schema](examples/standard-schema.ts).
React usage is covered in [docs/examples.md](docs/examples.md#react-forms).

## Performance

Measured with `npm run benchmark` (tinybench, 1 s per task) on Node.js 22.23.1 on an Apple M4,
comparing valiq-js 0.1.0, ajv 8.20.0, zod 4.6.7 and valibot 1.5.0. Every library validates the same
rules, and all accept unknown keys so that none of them copies the input. Higher is better.

| Workload                                | valiq-js | valiq-js (JSON Schema) |     Ajv |    Zod | Valibot |
| --------------------------------------- | -------: | ---------------------: | ------: | -----: | ------: |
| Valid object (nested, 5 fields), ops/s  |    7.1 M |                  4.1 M |  23.3 M |  3.5 M |   2.6 M |
| Invalid object, all errors, ops/s       |    1.0 M |                 0.82 M |  16.6 M |  1.4 M |   1.6 M |
| Valid array of 1,000 objects, ops/s     |    7,832 |                  4,396 |  38,307 |  3,576 |   2,723 |
| Discriminated union, 300 items, ops/s   |   68,286 |       27,308 (`oneOf`) | 114,957 | 75,153 |  16,970 |
| Define schema + first validation, ops/s |    520 k |                   42 k |     422 |   17 k |   899 k |

In short: Ajv is the fastest validator on hot paths because it generates JavaScript code. valiq-js
does not generate code, which makes it CSP-safe. It is about 2× faster than Zod and 2.7× faster
than Valibot on valid objects, and it starts up three orders of magnitude faster than Ajv's
compiler (useful for serverless cold starts). On invalid input, Zod and Valibot are faster than
valiq-js when every error is collected. Numbers vary by machine and workload. Run the suite yourself;
the methodology is in [docs/performance.md](docs/performance.md).

Bundle size (min+gzip, measured with `npm run size -- --compare`): an object schema with string,
number and array checks costs 9.4 KB with valiq-js, 20.7 KB with Zod, 5.5 KB with `zod/mini`,
1.5 KB with Valibot and 34.6 KB with Ajv (no formats). Everything in `valiq-js` is 11.5 KB;
`fromJSONSchema` adds about 6 KB.

## Security

Validation checks shape and constraints. It is not sanitisation (it does not make strings safe for
HTML or SQL) and not authorisation. valiq-js is designed for untrusted input:

- Own properties only: values inherited from a polluted `Object.prototype` are treated as missing,
  and `__proto__` keys are copied as data, never as prototypes.
- Input is never mutated. Object and array defaults are cloned for each use.
- Built-in formats use linear-time checks. User-supplied patterns are your responsibility; the
  JSON Schema `regExp` option lets you plug in RE2.
- Limits: `maxDepth` (512) for recursive schemas, `maxIssues` (100); arrays above `max()` /
  `maxItems` are rejected without visiting their items, and strings above `max()` / `maxLength`
  skip their remaining checks.
- Do not compile JSON Schemas from untrusted sources without reviewing them: patterns run as
  regular expressions.

See [docs/security.md](docs/security.md), and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Documentation

The [documentation site](https://www.m2toolkit.com/npm-packages/valiq-js) has every page below, search
and a live playground.

- [Getting started](docs/getting-started.md)
- [Core concepts](docs/concepts.md): parse vs safeParse vs is, input and output, immutability
- [Schemas](docs/schemas.md): every schema type, method and format rule
- [TypeScript](docs/typescript.md)
- [Errors](docs/errors.md)
- [JSON Schema](docs/json-schema.md)
- [Custom validation](docs/custom-validation.md)
- [Performance](docs/performance.md)
- [Security](docs/security.md)
- [API reference](docs/api.md)
- [Examples](docs/examples.md)
- [Migrating from Zod or Ajv](docs/migration.md)
- [Troubleshooting and FAQ](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)

## FAQ

**Should I use valiq-js or Ajv?** If you only validate JSON Schema documents on a very hot path, Ajv
is faster. Pick valiq-js if you want TypeScript-first schemas and JSON Schema in one library, errors
designed for users, strict schema checking with suggestions, fast startup or CSP compatibility.

**Does valiq-js strip unknown properties?** Not by default (the same as JSON Schema and Ajv). Use
`.strip()` to drop them, or `.strict()` to reject them. For API input, one of the two is
recommended.

**Is it production-ready?** Version 0.1 is a first release. The behaviour described here is tested
(300+ tests, the official JSON Schema test suite, property-based tests against Ajv), but the API may
still change before 1.0, following semver for 0.x (breaking changes bump the minor version).

More questions are answered in [docs/troubleshooting.md](docs/troubleshooting.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup.
`npm run verify` runs every check that CI runs.

## License

[MIT](LICENSE)

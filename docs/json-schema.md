# JSON Schema

valiq-js compiles JSON Schema documents into the same kind of schema the builder API produces, and
exports builder schemas to JSON Schema.

```ts
import { fromJSONSchema, toJSONSchema } from 'valiq-js/json-schema';
```

`toJSONSchema` is also exported from `valiq-js`.

## fromJSONSchema

```ts
import { fromJSONSchema } from 'valiq-js/json-schema';

const Address = fromJSONSchema({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    street: { type: 'string', minLength: 1 },
    postcode: { type: 'string', pattern: '^[0-9]{5}$' },
    country: { enum: ['DE', 'FR', 'PK'] },
  },
  required: ['street', 'country'],
  additionalProperties: false,
} as const);

Address.parse({ street: 'Main St 1', country: 'PK' });
```

The result has the full schema API (`parse`, `safeParse`, `is`, `.optional()`, `.refine()`,
`~standard`, ...), can be nested inside builder schemas, and reports the standard
[issue format](errors.md) plus `keyword` and `schemaPath`:

```json
{
  "code": "invalid_pattern",
  "path": ["postcode"],
  "message": "Expected a string matching /^[0-9]{5}$/",
  "pattern": "^[0-9]{5}$",
  "keyword": "pattern",
  "schemaPath": "#/properties/postcode/pattern"
}
```

Compilation happens inside `fromJSONSchema`, so an invalid schema throws a `JSONSchemaError`
(with a `schemaPath`) when your module loads, not when the first request arrives. Compile once and
reuse the result.

`.draft` tells you which dialect was used, and `.jsonSchema` holds the source document.

### Options

| Option          | Default                                            | Description                                                                                                                                                                                   |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`         | from `$schema`, else `'2020-12'`                   | `'2020-12'`, `'2019-09'` or `'draft-07'` (draft-06 schemas are read as draft-07)                                                                                                              |
| `strict`        | `true`                                             | Throw on unknown keywords (with "did you mean" suggestions), unknown formats, OpenAPI-only and draft-04 syntax, and malformed keyword values. Keywords starting with `x-` are always allowed. |
| `formats`       | `'assert'`                                         | `'annotate'` ignores `format` entirely                                                                                                                                                        |
| `customFormats` | —                                                  | `{ name: RegExp \| (value: string) => boolean }`, added to or replacing built-ins                                                                                                             |
| `schemas`       | —                                                  | Other documents that `$ref` may point to: an array (each with `$id`) or an object keyed by URI                                                                                                |
| `regExp`        | `new RegExp(source, 'u')`, falling back to no flag | Builds pattern matchers, e.g. `(source) => new RE2(source, 'u')`                                                                                                                              |

Parse options (`abortEarly`, `maxIssues`, `maxDepth`, `messages`) work as for any schema.

```ts
import { fromJSONSchema } from 'valiq-js/json-schema';

const address = { $id: 'https://example.com/address.json', type: 'object', required: ['city'] } as const;

const Person = fromJSONSchema(
  {
    type: 'object',
    properties: { home: { $ref: 'https://example.com/address.json' }, phone: { type: 'string', format: 'e164' } },
  },
  { schemas: [address], customFormats: { e164: /^\+[1-9]\d{6,14}$/ } },
);
void Person;
```

### Strict mode

Typos in schemas are a common source of silent bugs: an unknown keyword is ignored by the JSON
Schema specification, so `{ "maxLenght": 10 }` would accept any string. With `strict: true`
(the default) valiq-js throws instead:

```
JSONSchemaError: Unknown keyword "maxLenght" (did you mean "maxLength"?); pass { strict: false } to ignore unknown keywords (at #/maxLenght)
```

It also explains common mistakes, such as OpenAPI 3.0's `nullable: true` (use
`"type": ["string", "null"]`) and draft-04's boolean `exclusiveMinimum`. Use `strict: false` for
schemas that legitimately contain custom keywords.

## Supported keywords

| Area                              | Keywords                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any type                          | `type` (single or array), `enum`, `const` (deep equality)                                                                                                                                               |
| Numbers                           | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` (numeric form), `multipleOf`                                                                                                               |
| Strings                           | `minLength`, `maxLength` (code points), `pattern`, `format`                                                                                                                                             |
| Arrays                            | `items`, `prefixItems` (2020-12), array-form `items` + `additionalItems` (2019-09, draft-07), `contains`, `minContains`, `maxContains` (2019-09+), `minItems`, `maxItems`, `uniqueItems`                |
| Objects                           | `properties`, `required`, `additionalProperties`, `patternProperties`, `propertyNames`, `minProperties`, `maxProperties`, `dependentRequired`, `dependentSchemas` (2019-09+), `dependencies` (draft-07) |
| Composition                       | `allOf`, `anyOf`, `oneOf`, `not`, `if` / `then` / `else`                                                                                                                                                |
| References                        | `$ref`, `$id`, `$anchor`, `$dynamicAnchor` (as a plain anchor), `$defs`, `definitions`, boolean schemas, recursive references, remote references to registered schemas                                  |
| Annotations (accepted, no effect) | `$schema`, `$comment`, `title`, `description`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `contentMediaType`, `contentEncoding`, `contentSchema`, `$vocabulary`                      |

Formats (asserted by default): `date`, `time`, `date-time`, `duration`, `email`, `hostname`,
`ipv4`, `ipv6`, `uri`, `uri-reference`, `uuid`, `regex`, `json-pointer`,
`relative-json-pointer`, `uri-template`. The JSON Schema `email` format follows RFC 5321
(quoted local parts and address literals are valid), unlike the builder's stricter
`v.string().email()`.

### Semantics worth knowing

- `"type": "number"` rejects `NaN` and `±Infinity`, which JSON cannot represent anyway.
  `"type": "integer"` accepts `1.0`.
- In draft-07, `$ref` makes sibling keywords ignored, as the specification requires. In 2019-09 and
  2020-12, `$ref` combines with its siblings.
- `format` is asserted by default. The 2020-12 specification makes it an annotation unless a
  format-assertion vocabulary is used; pass `formats: 'annotate'` for that behaviour.
- `additionalProperties: false` reports one `unrecognized_keys` issue listing the extra keys.
  `required` reports one `required` issue per missing property, at that property's path.
- An array that fails `maxItems` is not checked further (its items are not visited).
- Recursive references stop at `maxDepth` (default 512) with `too_deep`.

## Not supported (yet)

Schemas using these keywords throw `JSONSchemaError` instead of being validated partially. That
is deliberate: silently ignoring them would accept invalid data.

- `unevaluatedProperties`, `unevaluatedItems`
- `$dynamicRef`, `$recursiveRef`, `$recursiveAnchor: true`
- Draft-04 and older (boolean `exclusiveMinimum`, `id`)

Also:

- Remote `$ref`s are never fetched; register referenced documents with the `schemas` option.
- Meta-schemas are not bundled, so `{ "$ref": "https://json-schema.org/draft/2020-12/schema" }`
  needs the meta-schema to be registered.
- The internationalised formats `idn-email`, `idn-hostname`, `iri` and `iri-reference` are not
  built in (they throw in strict mode; register them with `customFormats` if you need them).
  `hostname` does not decode and validate punycode (`xn--`) labels.
- `useDefaults`/`coerceTypes`-style data rewriting (as in Ajv) is not offered: JSON Schema
  validators never modify data.

## Conformance

Results against the official [JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite)
(commit `89e83a7`, vendored in `tests/fixtures`). Reproduce them with `npm run conformance`;
`npm run test:conformance` runs the same suite as part of the tests.

| Suite                         | Passed | Failed | Skipped |
| ----------------------------- | -----: | -----: | ------: |
| draft2020-12, required        |   1052 |      0 |     250 |
| draft2019-09, required        |   1032 |      0 |     229 |
| draft7, required              |    925 |      0 |       4 |
| draft2020-12, optional/format |    791 |    105 |       — |
| draft2019-09, optional/format |    791 |    105 |       — |
| draft7, optional/format       |    710 |    105 |       — |

Skipped cases are the unsupported keywords listed above (`unevaluated*`, `$dynamicRef`,
`$recursiveRef`, `vocabulary`) and tests that reference meta-schemas. In the required suites, the
2020-12 and 2019-09 `format.json` files are run with `formats: 'annotate'` (the specification's
default); every other file runs with valiq-js's defaults. The optional format failures are the
internationalised formats (`idn-*`, `iri*`) and punycode validation for `hostname`.

## toJSONSchema

```ts
import { toJSONSchema, v } from 'valiq-js';

const User = v
  .object({
    id: v.string().uuid(),
    email: v.string().email(),
    role: v.enum(['admin', 'user']).default('user'),
  })
  .strict()
  .meta({ title: 'User' });

toJSONSchema(User);
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   title: 'User',
//   type: 'object',
//   properties: {
//     id: { type: 'string', format: 'uuid' },
//     email: { type: 'string', format: 'email' },
//     role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
//   },
//   required: ['id', 'email'],
//   additionalProperties: false,
// }
```

Options:

| Option            | Default           | Description                                                                                                                                                                       |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`          | `'draft-2020-12'` | or `'draft-07'` (tuples become array-form `items`, `$defs` becomes `definitions`)                                                                                                 |
| `io`              | `'input'`         | describe accepted input, or `'output'`: properties with defaults become required, `.strip()` objects get `additionalProperties: false`, and checks after a string transform apply |
| `unrepresentable` | `'throw'`         | or `'any'` to emit `{}` for dates, `instance`, `custom`, coerced inputs and transform outputs                                                                                     |

What is not represented: refinements (`.refine()`), and string checks that come after a
transform when `io` is `'input'` (for example `.trim().min(2)` exports `{ type: 'string' }`).
The exported schema therefore accepts a superset of what the valiq-js schema accepts in those
cases, never a subset. Recursive `v.lazy` schemas are exported with `$defs` and `$ref`.
`isoTime()` and `isoDateTime({ local: true })` export as `pattern` because their JSON Schema
formats mean something different.

The test suite compiles exported schemas with Ajv in strict mode and checks, with property-based
tests, that Ajv and valiq-js agree on random data.

Every schema also implements Standard JSON Schema:
`schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })`.

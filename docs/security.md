# Security

Validation is a security boundary: it decides what reaches the rest of your code. This page
describes what Valiq guarantees, what it does not, and how to use it safely. To report a
vulnerability, see [SECURITY.md](../SECURITY.md).

## What validation is and is not

- **Validation** checks that data has the expected shape and satisfies constraints. That is
  Valiq's job.
- **Sanitisation** makes data safe for a particular sink (HTML, SQL, shell). Valiq does not do
  this. A string that passes `v.string().max(100)` can still contain `<script>`. Escape at output,
  use parameterised queries.
- **Authorisation** decides whether a user may perform an action. A valid request body says
  nothing about who sent it.
- **Transformation** (defaults, coercion, trimming) happens only where you ask for it.

## Guarantees

**Prototype pollution.** Valiq never assigns through `__proto__`: copied objects receive
`__proto__` as an ordinary own property (as `JSON.parse` produces it). Only own properties are
read, so a value inherited from a polluted `Object.prototype` is treated as missing and cannot
satisfy a `required` property. These cases are covered in `tests/security.test.ts`.

**No input mutation.** Validation never writes to the input. Transforms, defaults and `.strip()`
work on copies, and object/array defaults are cloned with `structuredClone` for every use, so one
request cannot change another's default. The property-based tests validate deep-frozen inputs.

**No coercion unless requested.** `v.number()` rejects `"1"`, `v.boolean()` rejects `"true"`.
`v.coerce.*` uses explicit rules; see [schemas](schemas.md#coercion--vcoerce).

**Linear-time built-in formats.** The regular expressions behind `email`, `uuid`, `ipv4`,
`ipv6`, `hostname`, the date/time formats, `uri`, `uri-template` and `duration` have no nested or
overlapping quantifiers, and lengths are checked first. The test suite includes adversarial
inputs with a timing budget.

**Resource limits.**

| Limit                                     |     Default | Effect                                                                            |
| ----------------------------------------- | ----------: | --------------------------------------------------------------------------------- |
| `maxDepth`                                |         512 | recursive schemas (`v.lazy`, `$ref`) stop with `too_deep`; also stops cyclic data |
| `maxIssues`                               |         100 | validation stops after this many issues                                           |
| `max()` / `maxItems`                      |           — | oversized arrays are rejected without visiting their items                        |
| `max()` / `maxLength`                     |           — | over-long strings skip their remaining checks (patterns, formats)                 |
| deep equality (`unique`, `const`, `enum`) | 1000 levels | deeper (or cyclic) values compare as unequal                                      |

Non-recursive schemas only descend as deep as the schema itself, so deeply nested input is
harmless for them.

**No code generation, no network.** Valiq never calls `eval` or `new Function` and never
fetches `$ref` targets; remote schemas must be registered explicitly.

**No values in messages.** Issue messages and fields contain schema information and type names,
never the input value. Object keys and array indexes do appear in paths.

## Your responsibilities

- **Your regular expressions.** Patterns you pass to `.regex()` or in JSON Schema `pattern` run on
  untrusted input. Avoid nested quantifiers such as `(a+)+`, bound string lengths with
  `.max()`/`maxLength`, and for JSON Schemas from third parties consider an RE2 engine:
  `fromJSONSchema(schema, { regExp: (source) => new RE2(source, 'u') })`.
- **Untrusted schemas.** Compiling a JSON Schema from an untrusted source lets its author choose
  the patterns and the shape of the work. Review schemas, or restrict the keywords you accept.
- **Your callbacks.** `.refine()`, `.transform()`, `v.custom()` and custom formats are your code.
  Valiq does not catch their exceptions or limit their running time. Keep them pure and fast.
- **Unknown keys.** By default unknown properties pass through untouched. For request bodies use
  `.strict()` or `.strip()` so that unexpected fields (`isAdmin`, `role`) never reach your
  database layer.
- **Bound your inputs.** Set `max()` on strings and arrays that come from users, and limit request
  body sizes before parsing JSON.
- **Raising limits.** Setting `maxDepth` very high can let deeply nested recursive data overflow
  the call stack (a `RangeError`). The default is chosen to stay well within typical stack sizes.

## Known limitations

- `hostname` does not validate punycode (`xn--`) labels. `email` is ASCII-only.
- Errors from user callbacks propagate unchanged.
- Valiq's own `.d.ts` types do not protect against data that bypasses validation (for example
  values cast with `as`).

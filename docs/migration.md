# Migrating

## From Zod

Most Zod schemas translate one-to-one: replace `z.` with `v.`.

| Zod 4                                   | Valiq                                          | Notes                                                                               |
| --------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `z.string().min(1)`                     | `v.string().min(1)`                            | Valiq counts Unicode code points                                                    |
| `z.email()` / `z.string().email()`      | `v.string().email()`                           | rules differ slightly, see [formats](schemas.md#string-formats)                     |
| `z.url()`                               | `v.string().url()`                             | Valiq allows only http(s) unless `protocols` is set                                 |
| `z.uuid()`                              | `v.string().uuid()`                            | Valiq accepts any version                                                           |
| `z.iso.date()` / `z.iso.datetime()`     | `v.string().isoDate()` / `.isoDateTime()`      |                                                                                     |
| `z.number().int()` / `z.int()`          | `v.number().int()`                             | Zod's `z.int()` is limited to safe integers                                         |
| `z.number().positive()`                 | `v.number().gt(0)`                             |                                                                                     |
| `z.enum(['a', 'b'])`, `z.nativeEnum(E)` | `v.enum(['a', 'b'])`, `v.enum(E)`              |                                                                                     |
| `z.object({...})`                       | `v.object({...}).strip()`                      | Zod strips unknown keys by default; Valiq keeps them unless you call `.strip()`     |
| `z.strictObject` / `.strict()`          | `.strict()`                                    |                                                                                     |
| `z.looseObject` / `.passthrough()`      | `v.object()` (the default)                     |                                                                                     |
| `z.discriminatedUnion('type', [...])`   | `v.union([...])`                               | discriminators are detected automatically                                           |
| `z.record(z.string(), V)`               | `v.record(v.string(), V)`                      |                                                                                     |
| `z.tuple([A], R)`                       | `v.tuple([A]).rest(R)`                         |                                                                                     |
| `.superRefine((v, ctx) => ...)`         | `.refine(check, { path, message })`            | one issue per `refine`                                                              |
| `z.coerce.number()`                     | `v.coerce.number()`                            | Valiq rejects `""`, `"0x10"`, `null` and booleans; Zod uses `Number(x)`             |
| `z.coerce.boolean()`                    | `v.coerce.boolean()`                           | Zod uses `Boolean(x)` (`"false"` becomes `true`); Valiq accepts only true/false/1/0 |
| `z.infer<typeof S>` / `z.input<>`       | `Infer<typeof S>` / `Input<>` (also `v.Infer`) |                                                                                     |
| `error.issues`, `error.flatten()`       | `error.issues`, `error.flatten()`              | Valiq's flatten returns `{ root, fields }`                                          |
| `z.toJSONSchema(S)`                     | `toJSONSchema(S)`                              |                                                                                     |

Issue codes differ (Valiq uses `required` for missing properties and `invalid_format` for string
formats), so code that switches on `issue.code` needs updating.

## From Ajv

Your JSON Schemas can usually be used as they are:

```ts
import { fromJSONSchema } from 'valiq/json-schema';

// Before: const validate = ajv.compile(schema); if (!validate(data)) console.log(validate.errors);
const schema = { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } as const;
const Thing = fromJSONSchema(schema);

const result = Thing.safeParse({ id: 'x' });
if (!result.success) console.log(result.error.issues);
```

Differences to check:

| Ajv                                                                                                      | Valiq                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `validate(data)` + `validate.errors`                                                                     | `schema.safeParse(data)` returns the issues; `schema.is(data)` for a boolean                                |
| `allErrors: false` (default)                                                                             | all errors by default; `{ abortEarly: true }` for the first one                                             |
| `instancePath: '/items/0'`                                                                               | `path: ['items', 0]`; `schemaPath` is the same idea                                                         |
| `required` errors at the parent                                                                          | `required` issues at the missing property's path                                                            |
| `strict` mode                                                                                            | `strict: true` by default, with "did you mean" hints                                                        |
| `ajv-formats`                                                                                            | built in (15 formats); `customFormats` for more                                                             |
| `ajv.addSchema(s)`                                                                                       | `fromJSONSchema(root, { schemas: [s] })`                                                                    |
| `useDefaults`, `coerceTypes`, `removeAdditional`                                                         | not supported: validation never changes data. Use builder schemas with `.default()`, `v.coerce`, `.strip()` |
| `$data`, `$merge`, async schemas, `unevaluated*`, `$dynamicRef`                                          | not supported                                                                                               |
| `JSONSchemaType<T>` (type → schema)                                                                      | `FromSchema<S>` (schema → type) via `as const`                                                              |
| standalone code generation                                                                               | not needed: Valiq does not use `eval`, so it runs under strict CSP                                          |
| `multipleOf` uses `parseInt` on the quotient                                                             | exact for large quotients too (Ajv says `5e20` is not a multiple of `0.5`)                                  |
| `enum`/`const` throw a `TypeError` for objects with a non-function `toString` key (in `fast-deep-equal`) | compared like any other object                                                                              |

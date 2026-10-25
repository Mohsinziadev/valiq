# API reference

## Entry points

| Import                 | Exports                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `valiq-js`             | `v`, `toJSONSchema`, `ValiqError`, `isValiqError`, `formatPath`, `defaultMessage`, schema classes, types |
| `valiq-js/json-schema` | `fromJSONSchema`, `JSONSchemaSchema`, `JSONSchemaError`, `toJSONSchema`, types                           |

## `v` — schema factories

| Factory                                      | Returns                    | Output type                    |
| -------------------------------------------- | -------------------------- | ------------------------------ |
| `v.string(options?)`                         | `StringSchema`             | `string`                       |
| `v.number(options?)`                         | `NumberSchema`             | `number`                       |
| `v.boolean(options?)`                        | `BooleanSchema`            | `boolean`                      |
| `v.date(options?)`                           | `DateSchema`               | `Date`                         |
| `v.null(options?)`, `v.undefined(options?)`  | `TypeSchema`               | `null`, `undefined`            |
| `v.unknown()`, `v.never(options?)`           | `TypeSchema`               | `unknown`, `never`             |
| `v.literal(value, options?)`                 | `LiteralSchema`            | the literal                    |
| `v.enum(values \| tsEnum, options?)`         | `EnumSchema`               | union of the values            |
| `v.object(shape, options?)`                  | `ObjectSchema`             | object type                    |
| `v.array(item, options?)`                    | `ArraySchema`              | `T[]`                          |
| `v.tuple(items, options?)`                   | `TupleSchema`              | `[A, B, ...]`                  |
| `v.record(key, value, options?)`             | `RecordSchema`             | `Record<K, V>`                 |
| `v.union(options, { message }?)`             | `UnionSchema`              | `A \| B \| ...`                |
| `v.intersection(members)`                    | `IntersectionSchema`       | `A & B & ...`                  |
| `v.lazy(getter)`                             | `LazySchema`               | the getter's schema type       |
| `v.instance(Class, options?)`                | `InstanceSchema`           | `InstanceType<Class>`          |
| `v.custom<T>(check, message?)`               | `CustomSchema`             | `T` (or the type guard's type) |
| `v.coerce.number()`, `.boolean()`, `.date()` | number/boolean/date schema | `number`, `boolean`, `Date`    |

`options` is `{ message?: string | ((issue) => string) }` and applies to the type check.
`v.Infer<S>`, `v.Input<S>`, `v.AnySchema`, `v.Shape`, `v.Literal` and `v.TypeOptions` are types on
the namespace.

## Methods on every schema

| Member                                                | Description                                            |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `parse(data, options?)`                               | returns the output or throws `ValiqError`              |
| `safeParse(data, options?)`                           | `{ success: true, data } \| { success: false, error }` |
| `is(data)`                                            | type guard (`data is Input`)                           |
| `optional()`, `nullable()`, `nullish()`               | widen to `undefined` / `null` / both                   |
| `default(value \| () => value)`                       | replace `undefined`                                    |
| `refine(check, message \| { message, path, params })` | custom check; returns the same schema type             |
| `transform(fn)`                                       | map the output                                         |
| `pipe(schema)`                                        | validate the output with another schema                |
| `brand<B>()`                                          | nominal output type                                    |
| `meta({ title, description, examples, deprecated })`  | documentation for JSON Schema export                   |
| `kind`                                                | `'string'`, `'object'`, `'union'`, ...                 |
| `'~standard'`                                         | Standard Schema v1 and Standard JSON Schema v1 props   |

### ParseOptions

| Option       | Default | Description                                                  |
| ------------ | ------: | ------------------------------------------------------------ |
| `abortEarly` | `false` | stop at the first issue                                      |
| `maxIssues`  |   `100` | stop after this many issues                                  |
| `maxDepth`   |   `512` | nesting limit for recursive schemas                          |
| `messages`   |       — | `(issue) => string \| undefined`, overrides default messages |

## Schema-specific methods

**StringSchema**: `min(n)`, `max(n)`, `length(n)`, `regex(re)`, `email()`, `url({ protocols? })`,
`uuid()`, `ipv4()`, `ipv6()`, `hostname()`, `isoDate()`, `isoTime()`,
`isoDateTime({ local? })`, `startsWith(s)`, `endsWith(s)`, `includes(s)`, `trim()`,
`toLowerCase()`, `toUpperCase()`. Every check takes an optional message (`string` or `{ message }`).

**NumberSchema**: `min(n)`, `max(n)`, `gt(n)`, `lt(n)`, `int()`, `multipleOf(n)`.

**DateSchema**: `min(date)`, `max(date)`.

**EnumSchema**: `options` (the values), `enum` (values keyed by themselves).

**LiteralSchema**: `value`.

**ObjectSchema**: `shape`, `strict()`, `strip()`, `passthrough()`, `catchall(schema)`,
`extend(shape)`, `pick(...keys)`, `omit(...keys)`, `partial(...keys?)`, `required(...keys?)`,
`keyof()`.

**ArraySchema**: `element`, `min(n)`, `max(n)`, `length(n)`, `unique()`.

**TupleSchema**: `items`, `rest(schema)`.

**RecordSchema**: `keySchema`, `valueSchema`.

**UnionSchema**: `options`, `discriminator` (the detected property, or `undefined`).

**IntersectionSchema**: `members`.

**LazySchema**: `schema` (the resolved schema).

**OptionalSchema / NullableSchema / DefaultSchema**: `unwrap()`, `inner`; `DefaultSchema` also has
`defaultValue`.

## Errors

- `class ValiqError extends Error` — `issues: Issue[]`, `flatten(): FlattenedIssues`,
  `format(): string`.
- `isValiqError(value): value is ValiqError`
- `formatPath(path): string`
- `defaultMessage(issue): string`
- Types: `Issue`, `IssueCode`, `PathKey`, `SizeOrigin`, `MessageSpec`, one interface per issue code
  (`InvalidTypeIssue`, `TooSmallIssue`, ...). See [errors](errors.md).

## JSON Schema

- `fromJSONSchema(schema, options?): JSONSchemaSchema<FromSchema<S>>`
- `class JSONSchemaSchema<T>` — a `Schema<T>` with `jsonSchema`, `draft` and `typed<U>()`.
- `class JSONSchemaError extends Error` — `schemaPath: string`.
- `toJSONSchema(schema, { target?, io?, unrepresentable? }): Record<string, unknown>`
- Types: `FromSchema<S>`, `JSONSchemaOptions`, `JSONSchemaDocument`, `Draft`, `RegExpLike`,
  `ToJSONSchemaOptions`, `JSONSchemaTarget`.

See [JSON Schema](json-schema.md).

## Types

- `Infer<S>` — output type. `Input<S>` — input type.
- `Schema<Out, In>` — base class; `AnySchema` = `Schema<unknown, unknown>`.
- `SafeParseResult<T>`, `SafeParseSuccess<T>`, `SafeParseFailure`.
- `Brand<B>`, `ObjectInput`, `ObjectOutput`, `Shape`, `UnknownKeys`, `RefineOptions`,
  `SchemaMeta`, `CheckOptions`, `TypeOptions`, `UrlOptions`, `DateTimeOptions`, `Literal`.
- `StandardSchemaV1`, `StandardJSONSchemaV1` — the Standard Schema interfaces.

Members whose names start with `_` are internal and may change in any release.

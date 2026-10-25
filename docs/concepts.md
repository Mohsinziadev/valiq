# Core concepts

## Schemas are values

A schema is an immutable object. Every method returns a new schema and leaves the original as it
was, so schemas can be shared and extended freely:

```ts
import { v } from 'valiq-js';

const Name = v.string().trim().min(1);
const ShortName = Name.max(20); // Name itself is unchanged
const User = v.object({ name: Name });
const Admin = User.extend({ permissions: v.array(v.string()) });
void [ShortName, Admin];
```

Schemas compile themselves the first time they are used and cache the result. Define them once at
module level rather than inside functions that run per request.

## parse, safeParse and is

| Method                      | Returns                                                  | Invalid input       |
| --------------------------- | -------------------------------------------------------- | ------------------- |
| `parse(data, options?)`     | the output value                                         | throws `ValiqError` |
| `safeParse(data, options?)` | `{ success: true, data }` or `{ success: false, error }` | never throws        |
| `is(data)`                  | `boolean`, and narrows `data` in TypeScript              | `false`             |

`is` does not build error details and, for most schemas, allocates nothing, which makes it the
fastest option. Use it for filtering and guards.

Exceptions thrown by your own code (for example inside `.refine()` or `.transform()`) are not
caught; they propagate from all three methods.

## Validation, not transformation

By default valiq-js only checks data:

- Valid input is returned as the **same object** (`schema.parse(x) === x`).
- Nothing is coerced: `v.number()` rejects `"42"`.
- Unknown object properties are kept, as in JSON Schema.
- The input is never modified.

Transformations are always explicit:

| You write                                      | Effect                              |
| ---------------------------------------------- | ----------------------------------- |
| `v.coerce.number()` / `.boolean()` / `.date()` | converts strings using strict rules |
| `.default(value)`                              | fills in `undefined`                |
| `.trim()`, `.toLowerCase()`, `.toUpperCase()`  | rewrites strings                    |
| `.strip()`                                     | removes unknown object properties   |
| `.transform(fn)`                               | maps the value with your function   |

When a transformation changes a nested value, valiq-js copies only the objects and arrays on the
path to that value ("copy on write"). Copies are plain objects with the original's own
enumerable properties.

## Input and output types

A schema has an input type (what it accepts) and an output type (what `parse` returns). They
differ when defaults or transforms are involved:

```ts
import { v, type Infer, type Input } from 'valiq-js';

const Page = v.object({ size: v.number().default(20), query: v.string().transform((q) => q.split(' ')) });

type PageInput = Input<typeof Page>; // { query: string; size?: number | undefined }
type Page = Infer<typeof Page>; // { size: number; query: string[] }
```

`is(data)` narrows to the input type, since it checks whether data is acceptable.

## Optional vs nullable

- `.optional()` accepts `undefined`. In an object, the property may be missing.
- `.nullable()` accepts `null`.
- `.nullish()` accepts both.

A missing required property produces a `required` issue at that property's path.

## Objects and unknown keys

| Mode           | Unknown keys are...            | Output                                  |
| -------------- | ------------------------------ | --------------------------------------- |
| default        | allowed and kept               | the same object                         |
| `.strict()`    | rejected (`unrecognized_keys`) | the same object                         |
| `.strip()`     | removed                        | a copy, only if there were unknown keys |
| `.catchall(s)` | validated with `s`             | the same object unless `s` transforms   |

For API request bodies, prefer `.strict()` or `.strip()` so that clients cannot send fields your
code doesn't expect (mass assignment).

Only own properties are read. A value that is only inherited, for example from a polluted
`Object.prototype`, counts as missing. Arrays are not objects for `v.object`; other objects,
including class instances, are accepted.

## Collecting issues

By default all issues are collected (up to `maxIssues`, default 100). Pass
`{ abortEarly: true }` to stop at the first one. An array that exceeds its `max()` is rejected
without validating its items, and recursive schemas stop at `maxDepth` (default 512) with a
`too_deep` issue.

```ts
import { v } from 'valiq-js';

const Ids = v.array(v.string().uuid()).max(1000);
Ids.safeParse(['x', 'y'], { abortEarly: true }); // one issue
Ids.safeParse(['x', 'y'], { maxIssues: 10 }); // at most ten issues
```

## Builder schemas and JSON Schema

`fromJSONSchema()` returns a schema of the same kind as the builder API: it has `parse`,
`safeParse`, `is`, `.optional()`, `.refine()` and so on, produces the same issue format, and can
be nested inside `v.object()`. `toJSONSchema()` goes the other way. See [JSON Schema](json-schema.md).

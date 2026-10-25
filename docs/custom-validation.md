# Custom validation

## refine

`.refine(check, message | options)` adds a check that runs after the schema itself succeeded. It
receives the output (after defaults and transforms) and returns `true` when the value is valid.

```ts
import { v } from 'valiq-js';

const Even = v
  .number()
  .int()
  .refine((n) => n % 2 === 0, 'Must be even');

const Range = v.object({ from: v.number(), to: v.number() }).refine((r) => r.from <= r.to, {
  message: '"from" must not be after "to"',
  path: ['from'],
  params: { rule: 'order' },
});
void [Even, Range];
```

| Option    | Effect                                                         |
| --------- | -------------------------------------------------------------- |
| `message` | string or `(issue) => string`; default `'Invalid value'`       |
| `path`    | where to report the issue, relative to the refined value       |
| `params`  | copied into the issue's `params`, for machine-readable details |

Failures produce a `custom` issue. `refine` keeps the schema's type, so builder methods remain
available afterwards (`v.string().refine(f).min(3)`).

Things to know:

- A refinement on an object only runs when every property is valid. A cross-field rule such as
  "passwords match" therefore appears once the fields themselves are fixed.
- `check` must be free of side effects. For invalid input valiq-js may run it more than once.
- Exceptions thrown by `check` are not caught. They propagate to the caller of
  `parse`/`safeParse`/`is`.
- Refinements cannot be expressed in JSON Schema and are left out by `toJSONSchema`.

## custom

`v.custom` creates a schema from a predicate, for types that have no built-in schema:

```ts
import { v, type Infer } from 'valiq-js';

const Bytes = v.custom((value): value is Uint8Array => value instanceof Uint8Array, 'Expected binary data');
type Bytes = Infer<typeof Bytes>; // Uint8Array

const Positive = v.custom<number>((value) => typeof value === 'number' && value > 0);
void Positive;
```

For class instances, `v.instance(File)` is shorter and reports `invalid_type` with the class name.

## transform and pipe

```ts
import { v } from 'valiq-js';

// "12,500" → 12500, then validate the number
const Amount = v
  .string()
  .transform((text) => Number(text.replaceAll(',', '')))
  .pipe(v.number().int().min(0));

// Split a comma-separated query parameter
const Tags = v
  .string()
  .transform((text) => text.split(',').map((tag) => tag.trim()))
  .pipe(v.array(v.string().min(1)).max(10));
void [Amount, Tags];
```

`transform` functions receive valid input and cannot fail. To reject a value during conversion,
`pipe` the result into a schema that rejects it (`NaN` fails `v.number()`).

## Reusable rules

Schemas are values, so a rule is a function that returns or extends a schema:

```ts
import { v } from 'valiq-js';

const password = () =>
  v
    .string()
    .min(12, 'Use at least 12 characters')
    .refine((s) => /\d/.test(s), 'Include a digit')
    .refine((s) => /[A-Z]/.test(s), 'Include an uppercase letter');

const Signup = v.object({ email: v.string().email(), password: password() });
void Signup;
```

## Custom JSON Schema formats

```ts
import { fromJSONSchema } from 'valiq-js/json-schema';

const Schema = fromJSONSchema(
  { type: 'object', properties: { sku: { type: 'string', format: 'sku' } } },
  { customFormats: { sku: (value) => /^[A-Z]{3}-\d{4}$/.test(value) } },
);
void Schema;
```

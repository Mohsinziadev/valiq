# Schemas

All factories live on the `v` namespace: `import { v } from 'valiq-js'`. Factories that check a type
accept `{ message }` to customise the `invalid_type` message, e.g. `v.string({ message: 'Name must be text' })`.
Checks accept a message string or `{ message }`, where a message is a string or a function of the
issue.

## Strings — `v.string()`

| Method                                                                                                    | Rule                                                                     | Issue                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `min(n)` / `max(n)` / `length(n)`                                                                         | length in **Unicode code points** (an emoji counts as 1)                 | `too_small` / `too_big` (`origin: 'string'`) |
| `regex(re)`                                                                                               | `re.test(value)`; `g`/`y` flags are dropped so `lastIndex` never matters | `invalid_pattern`                            |
| `startsWith(s)` / `endsWith(s)` / `includes(s)`                                                           | plain substring checks                                                   | `invalid_format`                             |
| `email()`, `url()`, `uuid()`, `ipv4()`, `ipv6()`, `hostname()`, `isoDate()`, `isoTime()`, `isoDateTime()` | see below                                                                | `invalid_format`                             |
| `trim()`, `toLowerCase()`, `toUpperCase()`                                                                | transforms; checks added **after** them see the new value                | —                                            |

Checks run in the order you add them, and all failures are reported.

### String formats

All format checks are linear-time (no ReDoS) and reject oversized input cheaply.

| Method                         | Accepts                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email()`                      | `local@domain`: dot-atom local part of at most 64 characters (`A-Z a-z 0-9` and ``!#$%&'*+/=?^_`{\|}~-``, single dots between atoms), a domain of at least two labels (letters, digits, inner hyphens, 1–63 characters each), at most 254 characters in total. Quoted local parts, IP-address domains and non-ASCII addresses are rejected (use punycode). |
| `url(options?)`                | a URL accepted by the WHATWG `URL` parser, without whitespace, at most 8192 characters, whose scheme is in `protocols` (default `['http', 'https']`, case-insensitive). `javascript:` URLs are rejected by default.                                                                                                                                        |
| `uuid()`                       | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` in hex, any case, any version or variant (including nil and max).                                                                                                                                                                                                                                                   |
| `ipv4()`                       | dotted quad `0`–`255` without leading zeros (`01.2.3.4` is rejected as ambiguous).                                                                                                                                                                                                                                                                         |
| `ipv6()`                       | RFC 4291 text form, including `::` compression and an IPv4 tail (`::ffff:192.0.2.1`). No brackets, no zone IDs.                                                                                                                                                                                                                                            |
| `hostname()`                   | RFC 1123: labels of 1–63 letters, digits and inner hyphens, at most 253 characters, no trailing dot. `--` in positions 3–4 is only allowed for `xn--` labels.                                                                                                                                                                                              |
| `isoDate()`                    | `YYYY-MM-DD` that is a real calendar date (leap years included).                                                                                                                                                                                                                                                                                           |
| `isoTime()`                    | local time `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff` (1–9 fraction digits), no offset — the format of `<input type="time">`.                                                                                                                                                                                                                                   |
| `isoDateTime()`                | RFC 3339 date-time: `YYYY-MM-DDTHH:MM:SS[.frac](Z\|±HH:MM)`. Seconds and offset are required; `T`/`Z` may be lowercase; a leap second is only accepted at 23:59 UTC.                                                                                                                                                                                       |
| `isoDateTime({ local: true })` | `YYYY-MM-DDTHH:MM[:SS[.fff]]` without offset — the format of `<input type="datetime-local">`.                                                                                                                                                                                                                                                              |

```ts
import { v } from 'valiq-js';

const Website = v.string().url(); // http(s) only
const Link = v.string().url({ protocols: ['https', 'mailto'] });
const Slug = v
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9-]+$/);
void [Website, Link, Slug];
```

## Numbers — `v.number()`

Accepts finite numbers only: `NaN`, `Infinity` and `-Infinity` are rejected (`received: 'NaN'` /
`'Infinity'`).

| Method              | Rule                                                     | Issue                                       |
| ------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `min(n)` / `max(n)` | `>= n` / `<= n`                                          | `too_small` / `too_big`, `inclusive: true`  |
| `gt(n)` / `lt(n)`   | `> n` / `< n`                                            | `too_small` / `too_big`, `inclusive: false` |
| `int()`             | `Number.isInteger`                                       | `invalid_type` with `expected: 'integer'`   |
| `multipleOf(d)`     | exact for decimal divisors: `0.3` is a multiple of `0.1` | `not_multiple_of`                           |

`int()` accepts large integers such as `1e21`; add `.max(Number.MAX_SAFE_INTEGER)` if you need
safe integers.

## Booleans, null, undefined, unknown, never

`v.boolean()`, `v.null()`, `v.undefined()` accept exactly that type. `v.unknown()` accepts
anything and types it as `unknown`. `v.never()` accepts nothing.

## Dates — `v.date()`

Accepts `Date` instances whose time is valid (`new Date('nope')` is rejected). `min(date)` and
`max(date)` take a `Date`, a timestamp or a date string and are inclusive.

## Literals and enums

```ts
import { v } from 'valiq-js';

const Yes = v.literal('yes'); // compared with ===
const Status = v.enum(['draft', 'published', 'archived']);
Status.options; // ['draft', 'published', 'archived']
Status.enum.draft; // 'draft'

enum Direction {
  Up = 'up',
  Down = 'down',
}
const Dir = v.enum(Direction); // TypeScript enums work too (numeric reverse mappings are ignored)
void [Yes, Dir];
```

Failures produce `invalid_value` with the allowed `values`.

## Objects — `v.object(shape)`

```ts
import { v } from 'valiq-js';

const User = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string().email().optional(),
});

User.strict(); // reject unknown keys
User.strip(); // remove unknown keys from the output
User.catchall(v.string()); // validate unknown keys
User.extend({ age: v.number() }); // add or replace properties
User.pick('id', 'name');
User.omit('email');
User.partial(); // every property optional; .partial('name') for some
User.required(); // remove .optional() from every property (or the listed ones)
User.keyof(); // v.enum(['id', 'name', 'email'])
User.shape.name; // the property schema
```

Accepted values: non-null, non-array objects. Only own enumerable string keys are read; inherited
properties count as missing. Missing properties whose schema rejects `undefined` produce
`required`. See [concepts](concepts.md#objects-and-unknown-keys) for the unknown-key modes.

`extend`, `pick`, `omit`, `partial` and `required` drop refinements attached to the object
itself, since they may no longer hold for the new shape.

## Arrays and tuples

```ts
import { v } from 'valiq-js';

const Tags = v.array(v.string()).min(1).max(10).unique();
const Point = v.tuple([v.number(), v.number()]);
const Command = v.tuple([v.string()]).rest(v.string()); // [string, ...string[]]
void [Tags, Point, Command];
```

`unique()` compares items with JSON deep equality (object key order does not matter, `0` equals
`-0`) in linear time for JSON-like data. An array longer than `max()` fails with `too_big`
without its items being validated.

## Records — `v.record(key, value)`

```ts
import { v } from 'valiq-js';

const Headers = v.record(v.string().regex(/^[a-z-]+$/), v.string());
const Flags = v.record(v.enum(['beta', 'darkMode']), v.boolean()); // keys optional in the type
void [Headers, Flags];
```

Every own key is checked with the key schema (failures produce `invalid_key` at that key) and
every value with the value schema.

## Unions and intersections

```ts
import { v } from 'valiq-js';

const Id = v.union([v.string().uuid(), v.number().int()]);

const Event = v.union([
  v.object({ type: v.literal('click'), x: v.number(), y: v.number() }),
  v.object({ type: v.literal('key'), key: v.string() }),
]);
Event.discriminator; // 'type' (detected automatically)

const Timestamped = v.intersection([v.object({ id: v.string() }), v.object({ createdAt: v.string() })]);
void [Id, Timestamped];
```

A union returns the output of the first member that accepts the value. When every member is a
`v.object` and they share a property whose values are distinct literals or enums, Valiq detects
it as a discriminator: it selects the member in O(1) and reports only that member's issues, or
`invalid_value` at the discriminator when no member matches.

Without a discriminator, issues are reported like this:

- exactly one member got past its type check: that member's issues are reported directly;
- every member failed on type alone: one `invalid_type` lists all expected types
  (`Expected string | number, received boolean`);
- otherwise: one `invalid_union` issue whose `branches` hold each member's issues (with absolute
  paths).

`v.intersection` requires every member to accept the value. If members transform an object, the
properties each one changed are merged (later members win).

## Recursive schemas — `v.lazy`

```ts
import { v, type Schema } from 'valiq-js';

interface Comment {
  text: string;
  replies: Comment[];
}

const Comment: Schema<Comment> = v.lazy(() => v.object({ text: v.string(), replies: v.array(Comment) }));
```

TypeScript needs the explicit `Schema<Comment>` annotation for recursive types. Recursion stops at
`maxDepth` (default 512) with a `too_deep` issue, which also protects against cyclic data.

## Wrappers available on every schema

| Method                                                | Effect                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.optional()`                                         | also accepts `undefined`                                                                                                              |
| `.nullable()`                                         | also accepts `null`                                                                                                                   |
| `.nullish()`                                          | both                                                                                                                                  |
| `.default(value \| () => value)`                      | replaces `undefined`; objects and arrays are cloned for every use (they must be `structuredClone`-able); the default is not validated |
| `.refine(check, message \| options)`                  | custom check on the output; see [custom validation](custom-validation.md)                                                             |
| `.transform(fn)`                                      | maps a valid value to anything                                                                                                        |
| `.pipe(schema)`                                       | validates the output with another schema                                                                                              |
| `.brand<'Name'>()`                                    | nominal type, no runtime effect                                                                                                       |
| `.meta({ title, description, examples, deprecated })` | documentation for `toJSONSchema`                                                                                                      |

`.unwrap()` on optional, nullable and default schemas returns the inner schema.

## Coercion — `v.coerce`

For sources that only have strings (environment variables, query strings, form data):

| Factory              | Converts                                                                          | Rejects                                                 |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `v.coerce.number()`  | numbers, and strings in decimal notation after trimming (`"42"`, `"-1.5e3"`)      | `""`, `"0x10"`, `"1,000"`, `"Infinity"`, booleans, null |
| `v.coerce.boolean()` | booleans; `"true"`, `"false"`, `"1"`, `"0"` (trimmed, any case); numbers `1`, `0` | `"yes"`, `""`, other numbers                            |
| `v.coerce.date()`    | dates; strings and numbers that `new Date()` turns into a valid date              | invalid dates, other types                              |

The result is a normal number, boolean or date schema, so `v.coerce.number().int().min(1)` works.

## Escape hatches

```ts
import { v } from 'valiq-js';

const Upload = v.instance(Blob); // value instanceof Blob
const Bytes = v.custom<Uint8Array>((x) => x instanceof Uint8Array, 'Expected bytes');
void [Upload, Bytes];
```

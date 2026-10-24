# TypeScript

Valiq is written in strict TypeScript and tested with `strict` and `exactOptionalPropertyTypes`.
Its type-level behaviour is covered by regression tests in [`type-tests/`](../type-tests).

## Inferring types

```ts
import { v, type Infer, type Input } from 'valiq';

const Product = v.object({
  id: v.string(),
  price: v.number().min(0),
  tags: v.array(v.string()).default([]),
  discount: v.number().optional(),
});

type Product = Infer<typeof Product>; // what parse() returns
// { id: string; price: number; tags: string[]; discount?: number | undefined }

type ProductInput = Input<typeof Product>; // what the schema accepts
// { id: string; price: number; tags?: string[] | undefined; discount?: number | undefined }
```

`v.Infer` and `v.Input` are the same types, available on the namespace.

Rules:

- A property is optional in the output type when its schema can output `undefined`
  (`.optional()`, `v.unknown()`), and optional in the input type when it accepts `undefined`
  (also `.default()`).
- Optional properties are typed `T | undefined`, matching runtime behaviour: an explicit
  `undefined` is accepted. With `exactOptionalPropertyTypes`, declare your own interfaces the same
  way (`name?: string | undefined`) when annotating schemas.
- `v.record(v.string(), V)` is `Record<string, V>`; with literal keys (`v.enum([...])`) it is
  `Partial<Record<K, V>>`, because keys are not required to be present.

## Unions narrow

```ts
import { v, type Infer } from 'valiq';

const Result = v.union([
  v.object({ ok: v.literal(true), value: v.number() }),
  v.object({ ok: v.literal(false), error: v.string() }),
]);
type Result = Infer<typeof Result>;

function show(result: Result): string {
  return result.ok ? `value ${result.value}` : `error ${result.error}`;
}
void show;
```

## Type guards

`schema.is(value)` narrows `value` to the schema's input type:

```ts
import { v } from 'valiq';

const Point = v.object({ x: v.number(), y: v.number() });

function length(value: unknown): number {
  if (!Point.is(value)) throw new TypeError('not a point');
  return Math.hypot(value.x, value.y);
}
void length;
```

## Brands

```ts
import { v, type Infer } from 'valiq';

const UserId = v.string().uuid().brand<'UserId'>();
const OrderId = v.string().uuid().brand<'OrderId'>();
type UserId = Infer<typeof UserId>;
type OrderId = Infer<typeof OrderId>;

declare function cancelOrder(id: OrderId): void;
const userId: UserId = UserId.parse('7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a');
// @ts-expect-error -- a UserId is not an OrderId
cancelOrder(userId);
```

Brands exist only in the type system.

## Recursive types

TypeScript cannot infer a type that refers to itself, so annotate recursive schemas:

```ts
import { v, type Schema } from 'valiq';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const Json: Schema<Json> = v.lazy(() =>
  v.union([v.string(), v.number(), v.boolean(), v.null(), v.array(Json), v.record(v.string(), Json)]),
);
```

## Writing functions that accept schemas

```ts
import { v, type AnySchema, type Infer } from 'valiq';

function parseOrDefault<S extends AnySchema>(schema: S, value: unknown, fallback: Infer<S>): Infer<S> {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

const port = parseOrDefault(v.number().int(), Number('80'), 3000); // number
void port;
```

`AnySchema` is `Schema<unknown, unknown>`; every Valiq schema is assignable to it.

## JSON Schema literals

Declare JSON Schemas `as const` and `fromJSONSchema` infers the data type. The inference covers
`type`, `const`, `enum`, `properties`/`required`/`additionalProperties`, `items`/`prefixItems`,
`anyOf`/`oneOf`/`allOf` and local `$ref`s (`#`, `#/$defs/*`, `#/definitions/*`, up to eight levels
of nested references). Anything else infers as `unknown`; use `.typed<T>()` to state the type
yourself:

```ts
import { fromJSONSchema } from 'valiq/json-schema';

const loaded: Record<string, unknown> = { type: 'object', required: ['id'] }; // e.g. read from disk
const Thing = fromJSONSchema(loaded).typed<{ id: string }>();
void Thing;
```

`.typed()` does not change validation; you are responsible for keeping the type and the schema in
sync.

## Standard Schema types

Valiq schemas implement `StandardSchemaV1<Input, Output>`, so
`StandardSchemaV1.InferOutput<typeof Schema>` works with any tool built on the standard.

## Compiler errors for misuse

These are rejected at compile time (and tested):

```ts
import { v } from 'valiq';

const User = v.object({ id: v.string() });
// @ts-expect-error -- min() takes a number
v.string().min('3');
// @ts-expect-error -- only declared keys can be picked
User.pick('email');
// @ts-expect-error -- the default must match the output type
v.number().default('1');
// @ts-expect-error -- record keys must be string schemas
v.record(v.number(), v.string());
```

# Getting started

## Install

```sh
npm install valiq
```

Valiq has no dependencies. It needs Node.js 18+ or a modern browser, and works with both
`import` and `require`:

```js
import { v } from 'valiq'; // ESM
const { v } = require('valiq'); // CommonJS
```

JSON Schema support lives in a separate entry point so that builder-only apps don't ship it:

```js
import { fromJSONSchema } from 'valiq/json-schema';
```

For TypeScript, use `"strict": true`. Any `moduleResolution` works (`bundler`, `node16`,
`nodenext`, or the legacy `node`).

## Your first schema

```ts
import { v, type Infer } from 'valiq';

const Todo = v.object({
  title: v.string().trim().min(1),
  done: v.boolean().default(false),
  due: v.string().isoDate().optional(),
});

type Todo = Infer<typeof Todo>;
// { title: string; done: boolean; due?: string | undefined }

const todo = Todo.parse({ title: '  Write docs ' });
// { title: 'Write docs', done: false }
```

## Three ways to validate

```ts
import { v } from 'valiq';

const Email = v.string().email();
const input: unknown = 'dev@example.com';

// 1. parse: returns the value or throws a ValiqError (use when invalid data is a bug)
const email = Email.parse(input);

// 2. safeParse: returns a result object (use for user input)
const result = Email.safeParse(input);
if (result.success) {
  console.log(result.data);
} else {
  console.log(result.error.issues);
}

// 3. is: a type guard returning true/false (fastest, no error details)
if (Email.is(input)) {
  console.log(input.toUpperCase());
}
void email;
```

## Handling errors

`safeParse` gives you a `ValiqError` with an `issues` array. Each issue has a `code`, a `path`
and a `message`:

```ts
import { v } from 'valiq';

const Login = v.object({ email: v.string().email(), password: v.string().min(8) });
const result = Login.safeParse({ email: 'x' });

if (!result.success) {
  result.error.issues; // full detail, JSON-serialisable
  result.error.flatten(); // { root: [], fields: { email: ['Invalid email address'], password: ['Required'] } }
  result.error.format(); // multi-line text for logs
}
```

Next: [core concepts](concepts.md), [all schema types](schemas.md), [errors](errors.md).

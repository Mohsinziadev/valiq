# Examples

Runnable examples live in [`examples/`](../examples). Each one asserts its own results; they run
in the test suite (`npm test`) and against the built package (`node scripts/run-examples.mjs`).

| Example                                                  | Shows                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| [api-request.ts](../examples/api-request.ts)             | validating a JSON request body, `.strip()`, 400 responses       |
| [env-config.ts](../examples/env-config.ts)               | environment variables with `v.coerce`, defaults, startup errors |
| [registration-form.ts](../examples/registration-form.ts) | form messages, cross-field `refine`, `flatten()` for display    |
| [nested-json.ts](../examples/nested-json.ts)             | nested objects, arrays of objects, discriminated unions, paths  |
| [json-schema.ts](../examples/json-schema.ts)             | `fromJSONSchema`, `$ref`, strict mode, `toJSONSchema`           |
| [custom-validators.ts](../examples/custom-validators.ts) | `refine`, `custom`, brands, transform + pipe, custom formats    |
| [compiled-reuse.ts](../examples/compiled-reuse.ts)       | defining schemas once, `is()` on hot paths                      |
| [standard-schema.ts](../examples/standard-schema.ts)     | using Valiq through the Standard Schema interface               |

## React forms

Valiq has no React dependency. Two common patterns follow. They are illustrative: they need React
and, for the second, React Hook Form, which this repository does not install.

**Plain React state**, using `flatten()` for per-field messages:

```tsx
import { useState } from 'react';
import { v } from 'valiq';

const Contact = v.object({
  email: v.string().trim().email('Enter a valid email'),
  message: v.string().trim().min(10, 'Tell us a bit more'),
});

export function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = Contact.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) return setErrors({ ...result.error.flatten().fields });
    setErrors({});
    void fetch('/api/contact', { method: 'POST', body: JSON.stringify(result.data) });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <input name="email" aria-invalid={!!errors.email} />
      {errors.email?.[0] && <p role="alert">{errors.email[0]}</p>}
      <textarea name="message" aria-invalid={!!errors.message} />
      {errors.message?.[0] && <p role="alert">{errors.message[0]}</p>}
      <button>Send</button>
    </form>
  );
}
```

**React Hook Form**, through its Standard Schema resolver (`@hookform/resolvers` 5 or later):

```tsx
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { v, type Infer } from 'valiq';

const Profile = v.object({ name: v.string().min(2), age: v.coerce.number().int().min(13) });

export function ProfileForm() {
  const { register, handleSubmit, formState } = useForm<Infer<typeof Profile>>({
    resolver: standardSchemaResolver(Profile),
  });
  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <input {...register('name')} />
      <p>{formState.errors.name?.message}</p>
      <input {...register('age')} />
      <p>{formState.errors.age?.message}</p>
    </form>
  );
}
```

The same Standard Schema support applies to other libraries that accept Standard Schema, such as
tRPC input validators and TanStack Form.

## Express middleware

Illustrative (Express is not installed here):

```js
import { isValiqError } from 'valiq';

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ issues: result.error.issues });
  req.body = result.data;
  next();
};

// Central error handler for routes that call schema.parse() directly
export function validationErrors(error, req, res, next) {
  if (isValiqError(error)) return res.status(400).json({ issues: error.issues });
  next(error);
}
```

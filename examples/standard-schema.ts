// valiq-js implements Standard Schema (https://standardschema.dev), so libraries that accept any
// Standard Schema (tRPC, TanStack Form, React Hook Form resolvers, Hono validators, ...) accept
// valiq-js schemas directly. This example uses the interface the same way such a library would.
import assert from 'node:assert/strict';
import { v, type StandardSchemaV1 } from 'valiq-js';

async function validateWithAnyLibrary<T>(schema: StandardSchemaV1<unknown, T>, value: unknown): Promise<T> {
  const result = await schema['~standard'].validate(value);
  if (result.issues) throw new Error(result.issues.map((issue) => issue.message).join('; '));
  return result.value;
}

const Login = v.object({ email: v.string().email(), password: v.string().min(8) });
const login = await validateWithAnyLibrary(Login, { email: 'dev@example.com', password: 'hunter22!' });
assert.equal(login.email, 'dev@example.com');
await assert.rejects(validateWithAnyLibrary(Login, { email: 'x' }), /Invalid email address; Required/);

// Standard JSON Schema: tools can ask any schema for its JSON Schema.
assert.equal(Login['~standard'].jsonSchema.input({ target: 'draft-2020-12' }).type, 'object');
console.log('standard schema ok');

// Validating environment variables at startup. Environment values are strings, so numbers and
// booleans use the opt-in, strict `v.coerce.*` conversions.
import assert from 'node:assert/strict';
import { v, type Infer } from 'valiq-js';

const Env = v.object({
  NODE_ENV: v.enum(['development', 'test', 'production']).default('development'),
  PORT: v.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: v.string().url({ protocols: ['postgres', 'postgresql'] }),
  ENABLE_CACHE: v.coerce.boolean().default(false),
  LOG_LEVEL: v.enum(['debug', 'info', 'warn', 'error']).optional(),
});

export type Env = Infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = Env.safeParse(source);
  if (!result.success) {
    // Fail fast with a readable report; values are never printed, so secrets stay out of logs.
    throw new Error(`Invalid environment configuration:\n${result.error.format()}`);
  }
  return result.data;
}

const env = loadEnv({ PORT: '8080', DATABASE_URL: 'postgres://db.internal:5432/app', ENABLE_CACHE: 'true' });
assert.deepEqual(env, {
  NODE_ENV: 'development',
  PORT: 8080,
  DATABASE_URL: 'postgres://db.internal:5432/app',
  ENABLE_CACHE: true,
});

assert.throws(
  () => loadEnv({ PORT: 'eighty', DATABASE_URL: 'mysql://x' }),
  (error: Error) => {
    console.log(error.message);
    return error.message.includes('→ at PORT') && error.message.includes('→ at DATABASE_URL');
  },
);

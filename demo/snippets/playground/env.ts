import { v } from 'valiq';

export const Env = v.object({
  NODE_ENV: v.enum(['development', 'test', 'production']),
  PORT: v.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: v.string().url({ protocols: ['postgres', 'postgresql'] }),
  DEBUG: v.coerce.boolean().default(false),
  ALLOWED_ORIGINS: v
    .string()
    .transform((list) => list.split(','))
    .pipe(v.array(v.string().url()).min(1)),
});

import { v } from 'valiq';

export const Signup = v
  .object({
    name: v.string().trim().min(2),
    email: v.string().trim().toLowerCase().email(),
    password: v.string().min(12),
    confirm: v.string(),
    age: v.number().int().min(18).optional(),
    newsletter: v.boolean().default(false),
  })
  .refine((form) => form.password === form.confirm, { message: 'Passwords do not match', path: ['confirm'] });

import { v, type Infer } from 'valiq';

const User = v.object({
  id: v.string().uuid(),
  email: v.string().email(),
  age: v.number().int().min(18),
  roles: v.array(v.enum(['admin', 'editor', 'viewer'])).default(['viewer']),
});

export type User = Infer<typeof User>;
// { id: string; email: string; age: number; roles: ("admin" | "editor" | "viewer")[] }

export function createUser(body: unknown) {
  const result = User.safeParse(body);
  if (!result.success) return { status: 400, issues: result.error.issues };
  return { status: 201, user: result.data }; // typed as User, roles defaults to ['viewer']
}

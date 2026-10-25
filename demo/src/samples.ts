import { v, type AnySchema, type Issue } from 'valiq';

/** The schema behind the hero's terminal. Its output is computed by Valiq while the page is built. */
export const User = v.object({
  id: v.string().uuid(),
  email: v.string().trim().toLowerCase().email(),
  age: v.number().int().min(18),
  roles: v.array(v.enum(['admin', 'editor', 'viewer'])).default(['viewer']),
  website: v.string().url().optional(),
});

export const userInput: Record<string, unknown> = {
  id: '7f1c1f8e-2a4b-4c55-9a51-0d6c1b0f4e2a',
  email: '  Ada@Example.COM ',
  age: 17,
  website: 'ftp://ada.dev',
};

export type FieldRow = { key: string; kind: string; ok: boolean; detail: string; issue?: Issue };

const baseKind = (schema: AnySchema): string =>
  'unwrap' in schema && typeof schema.unwrap === 'function' ? baseKind(schema.unwrap() as AnySchema) : schema.kind;

/** One row per field: each field's schema run on its own value, exactly as the object runs it. */
export function fieldRows(): FieldRow[] {
  return Object.entries(User.shape as Record<string, AnySchema>).map(([key, schema]) => {
    const result = schema.safeParse(userInput[key]);
    const kind = baseKind(schema);
    if (result.success) return { key, kind, ok: true, detail: JSON.stringify(result.data) ?? 'undefined' };
    const issue = result.error.issues[0]!;
    return { key, kind, ok: false, detail: issue.message, issue };
  });
}

export const userResult = User.safeParse(userInput);

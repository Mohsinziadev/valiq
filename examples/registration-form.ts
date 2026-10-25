// A registration form: per-field messages, a cross-field rule, and errors grouped for display.
import assert from 'node:assert/strict';
import { v } from 'valiq-js';

export const Registration = v
  .object({
    name: v.string().trim().min(2, 'Please enter your name'),
    email: v.string().trim().toLowerCase().email('Please enter a valid email address'),
    password: v.string().min(12, 'Use at least 12 characters'),
    confirmPassword: v.string(),
    acceptTerms: v.literal(true, { message: 'You must accept the terms' }),
  })
  .refine((form) => form.password === form.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Field errors keyed by field name, ready to render next to inputs. */
export function validateForm(values: unknown): Record<string, string[]> {
  const result = Registration.safeParse(values);
  return result.success ? {} : { ...result.error.flatten().fields };
}

assert.deepEqual(
  validateForm({ name: ' A ', email: 'not-an-email', password: 'short', confirmPassword: 'short', acceptTerms: false }),
  {
    name: ['Please enter your name'],
    email: ['Please enter a valid email address'],
    password: ['Use at least 12 characters'],
    acceptTerms: ['You must accept the terms'],
  },
);

// The cross-field rule runs once the fields themselves are valid.
assert.deepEqual(
  validateForm({
    name: 'Ada',
    email: 'ADA@example.com',
    password: 'correct horse battery',
    confirmPassword: 'correct horse staple',
    acceptTerms: true,
  }),
  { confirmPassword: ['Passwords do not match'] },
);

const ok = Registration.parse({
  name: '  Ada Lovelace ',
  email: ' ADA@Example.com',
  password: 'correct horse battery',
  confirmPassword: 'correct horse battery',
  acceptTerms: true,
});
assert.equal(ok.name, 'Ada Lovelace');
assert.equal(ok.email, 'ada@example.com');
console.log('registration form ok');

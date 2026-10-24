import { describe, expect, it } from 'vitest';
import { formatPath, isValiqError, v, ValiqError, type Issue } from '../src/index';

const Order = v.object({
  email: v.string().email(),
  items: v.array(v.object({ sku: v.string().min(3), qty: v.number().int().min(1) })).min(1),
});

describe('ValiqError', () => {
  it('is thrown by parse with a readable summary', () => {
    try {
      Order.parse({ email: 'x', items: [{ sku: 'a', qty: 0 }] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValiqError);
      expect(isValiqError(error)).toBe(true);
      const e = error as ValiqError;
      expect(e.name).toBe('ValiqError');
      expect(e.message).toBe(
        'Validation failed: email: Invalid email address; items[0].sku: Expected at least 3 characters; items[0].qty: Expected a number greater than or equal to 1',
      );
      expect(e.issues).toHaveLength(3);
    }
  });

  it('flatten() groups messages by field', () => {
    const error = Order.safeParse({ email: 'x', items: [{ sku: 'a', qty: 1 }, { sku: 'abc' }] }).error!;
    expect({ ...error.flatten().fields }).toEqual({
      email: ['Invalid email address'],
      'items[0].sku': ['Expected at least 3 characters'],
      'items[1].qty': ['Required'],
    });
    expect(v.string().safeParse(1).error!.flatten()).toMatchObject({ root: ['Expected string, received number'] });
  });

  it('format() renders a multi-line report', () => {
    expect(Order.safeParse({ email: 'x', items: [] }).error!.format()).toBe(
      '✖ Invalid email address\n  → at email\n✖ Expected at least 1 item\n  → at items',
    );
  });

  it('isValiqError recognises errors from another copy by shape', () => {
    const foreign = Object.assign(new Error('x'), { name: 'ValiqError', issues: [] });
    expect(isValiqError(foreign)).toBe(true);
    expect(isValiqError(new Error('x'))).toBe(false);
    expect(isValiqError('ValiqError')).toBe(false);
  });

  it('issues are JSON-serialisable', () => {
    const issues = Order.safeParse({}).error!.issues;
    expect(JSON.parse(JSON.stringify(issues))).toEqual(issues);
  });
});

describe('formatPath', () => {
  it('formats like JavaScript property access', () => {
    expect(formatPath([])).toBe('');
    expect(formatPath(['a', 0, 'b'])).toBe('a[0].b');
    expect(formatPath(['content-type'])).toBe('["content-type"]');
    expect(formatPath([0])).toBe('[0]');
    expect(formatPath(['headers', 'x y'])).toBe('headers["x y"]');
  });
});

describe('messages option', () => {
  it('localises default messages but keeps per-check messages', () => {
    const german = (issue: Issue) => (issue.code === 'required' ? 'Pflichtfeld' : undefined);
    const schema = v.object({ a: v.string(), b: v.string().min(2, 'Custom') });
    const issues = schema.safeParse({ b: 'x' }, { messages: german }).error!.issues;
    expect(issues.map((i) => i.message)).toEqual(['Pflichtfeld', 'Custom']);
  });
});

describe('limits', () => {
  it('maxIssues caps the issue list', () => {
    const data = Array.from({ length: 1000 }, () => 'x');
    expect(v.array(v.number()).safeParse(data).error!.issues).toHaveLength(100);
    expect(v.array(v.number()).safeParse(data, { maxIssues: 5 }).error!.issues).toHaveLength(5);
  });
});

describe('privacy', () => {
  it('never puts input values into messages', () => {
    const secret = 'hunter2-SECRET';
    const schema = v.object({
      password: v.string().min(50).email().regex(/^x/).uuid(),
      pin: v.number(),
      role: v.enum(['a', 'b']),
      nested: v.union([v.number(), v.boolean()]),
    });
    const issues = schema.safeParse({ password: secret, pin: secret, role: secret, nested: secret }).error!.issues;
    expect(JSON.stringify(issues)).not.toContain(secret);
    try {
      schema.parse({ password: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

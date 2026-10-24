import { describe, expect, it, vi } from 'vitest';
import { v } from '../src/index';

describe('optional / nullable / nullish', () => {
  it('widen the accepted values', () => {
    expect(v.string().optional().is(undefined)).toBe(true);
    expect(v.string().optional().is(null)).toBe(false);
    expect(v.string().nullable().is(null)).toBe(true);
    expect(v.string().nullable().is(undefined)).toBe(false);
    expect(v.string().nullish().is(null) && v.string().nullish().is(undefined)).toBe(true);
    expect(v.string().optional().unwrap().kind).toBe('string');
  });
});

describe('default', () => {
  it('uses the default for undefined only', () => {
    const schema = v.number().default(5);
    expect(schema.parse(undefined)).toBe(5);
    expect(schema.parse(1)).toBe(1);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it('calls factories every time', () => {
    let n = 0;
    const schema = v.number().default(() => ++n);
    expect([schema.parse(undefined), schema.parse(undefined)]).toEqual([1, 2]);
  });

  it('clones object defaults and rejects uncloneable ones up front', () => {
    const schema = v.object({ a: v.number() }).default({ a: 1 });
    const first = schema.parse(undefined);
    first.a = 99;
    expect(schema.parse(undefined)).toEqual({ a: 1 });
    expect(() => v.unknown().default({ f: () => 1 } as never)).toThrow();
  });
});

describe('refine', () => {
  it('runs after the base schema passed', () => {
    const check = vi.fn((s: string) => s.length > 2);
    const schema = v.string().refine(check, 'Too short');
    expect(schema.safeParse(1).error?.issues[0]?.code).toBe('invalid_type');
    expect(check).not.toHaveBeenCalled();
    expect(schema.safeParse('ab').error?.issues[0]).toMatchObject({ code: 'custom', message: 'Too short', path: [] });
    expect(schema.is('abc')).toBe(true);
  });

  it('keeps builder methods and composes', () => {
    const schema = v
      .string()
      .refine((s) => s !== 'admin', 'Reserved')
      .min(3);
    expect(schema.safeParse('admin').error?.issues[0]?.message).toBe('Reserved');
    expect(schema.safeParse('ab').error?.issues[0]?.code).toBe('too_small');
  });

  it('targets a path for cross-field rules', () => {
    const Signup = v
      .object({ password: v.string().min(8), confirm: v.string() })
      .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
        params: { rule: 'match' },
      });
    expect(Signup.safeParse({ password: 'abcdefgh', confirm: 'abcdefgx' }).error?.issues).toEqual([
      { code: 'custom', path: ['confirm'], message: 'Passwords do not match', params: { rule: 'match' } },
    ]);
  });

  it('sees transformed values', () => {
    const schema = v
      .string()
      .trim()
      .refine((s) => s === 'x');
    expect(schema.is(' x ')).toBe(true);
    expect(schema.parse(' x ')).toBe('x');
  });

  it('propagates exceptions thrown by user code', () => {
    const schema = v.string().refine(() => {
      throw new Error('boom');
    });
    expect(() => schema.safeParse('a')).toThrow('boom');
  });
});

describe('transform / pipe / brand / meta', () => {
  it('transform maps valid values', () => {
    const schema = v.string().transform((s) => s.length);
    expect(schema.parse('abc')).toBe(3);
    expect(schema.is('abc')).toBe(true);
    expect(schema.safeParse(1).success).toBe(false);
  });

  it('pipe validates the output of a transform', () => {
    const schema = v
      .string()
      .transform((s) => Number.parseInt(s, 10))
      .pipe(v.number().int().min(1));
    expect(schema.parse('12')).toBe(12);
    expect(schema.safeParse('0').error?.issues[0]?.code).toBe('too_small');
    expect(schema.safeParse('x').error?.issues[0]?.code).toBe('invalid_type');
    expect(schema.is('5')).toBe(true);
    expect(v.string().pipe(v.string().email()).is('a@b.co')).toBe(true);
  });

  it('brand is type-level only', () => {
    const UserId = v.string().uuid().brand<'UserId'>();
    const id = UserId.parse('123e4567-e89b-12d3-a456-426614174000');
    expect(typeof id).toBe('string');
  });

  it('meta does not affect validation', () => {
    const schema = v.string().meta({ title: 'Name', description: 'Full name' });
    expect(schema.is('a')).toBe(true);
  });

  it('schemas are immutable', () => {
    const base = v.string();
    const min = base.min(3);
    expect(base.is('a')).toBe(true);
    expect(min.is('a')).toBe(false);
    const obj = v.object({ a: v.string() });
    obj.strict();
    expect(obj.is({ a: 'x', b: 1 })).toBe(true);
  });
});

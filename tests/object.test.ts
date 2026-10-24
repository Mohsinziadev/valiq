import { describe, expect, it } from 'vitest';
import { v } from '../src/index';

const User = v.object({
  name: v.string(),
  age: v.number().int().optional(),
});

describe('object', () => {
  it('returns the input itself when nothing changes', () => {
    const input = { name: 'Ada', extra: true };
    expect(User.parse(input)).toBe(input);
  });

  it('rejects non-objects, arrays and null', () => {
    for (const value of [null, [], 'x', 1, undefined]) {
      expect(User.safeParse(value).error?.issues[0]).toMatchObject({ code: 'invalid_type', expected: 'object' });
    }
  });

  it('reports missing properties as required at their own path', () => {
    expect(User.safeParse({}).error?.issues).toEqual([{ code: 'required', path: ['name'], message: 'Required' }]);
    expect(User.safeParse({ name: undefined }).error?.issues[0]?.code).toBe('required');
  });

  it('allows optional properties to be absent or undefined', () => {
    expect(User.is({ name: 'a' })).toBe(true);
    expect(User.is({ name: 'a', age: undefined })).toBe(true);
    expect(User.safeParse({ name: 'a', age: 1.5 }).error?.issues[0]).toMatchObject({
      path: ['age'],
      expected: 'integer',
    });
  });

  it('builds nested paths', () => {
    const schema = v.object({ a: v.object({ b: v.array(v.object({ c: v.string() })) }) });
    expect(schema.safeParse({ a: { b: [{ c: 'x' }, { c: 1 }] } }).error?.issues[0]?.path).toEqual(['a', 'b', 1, 'c']);
  });

  it('ignores inherited properties, including polluted prototypes', () => {
    const schema = v.object({ toString: v.string().optional(), name: v.string() });
    expect(schema.is({ name: 'x' })).toBe(true);
    const proto = { name: 'inherited' };
    expect(schema.safeParse(Object.create(proto)).error?.issues[0]).toMatchObject({ code: 'required', path: ['name'] });
  });

  it('strict() rejects unknown keys in one issue', () => {
    const result = User.strict().safeParse({ name: 'a', x: 1, y: 2 });
    expect(result.error?.issues).toEqual([
      { code: 'unrecognized_keys', path: [], message: 'Unrecognized keys: "x", "y"', keys: ['x', 'y'] },
    ]);
    expect(User.strict().is({ name: 'a', x: 1 })).toBe(false);
    expect(User.strict().is({ name: 'a' })).toBe(true);
  });

  it('strip() removes unknown keys without touching the input', () => {
    const input = { name: 'a', secret: 'x' };
    const out = User.strip().parse(input);
    expect(out).toEqual({ name: 'a' });
    expect(input).toEqual({ name: 'a', secret: 'x' });
    const clean = { name: 'a' };
    expect(User.strip().parse(clean)).toBe(clean);
  });

  it('catchall() validates unknown keys', () => {
    const schema = v.object({ id: v.string() }).catchall(v.number());
    expect(schema.is({ id: 'a', x: 1 })).toBe(true);
    expect(schema.safeParse({ id: 'a', x: 'no' }).error?.issues[0]?.path).toEqual(['x']);
  });

  it('passthrough() restores the default', () => {
    expect(User.strict().passthrough().is({ name: 'a', x: 1 })).toBe(true);
  });

  it('extend / pick / omit / partial / required / keyof', () => {
    const Extended = User.extend({ email: v.string().email(), name: v.number() });
    expect(Extended.is({ name: 1, email: 'a@b.co' })).toBe(true);
    expect(User.pick('name').shape).toHaveProperty('name');
    expect(Object.keys(User.omit('age').shape)).toEqual(['name']);
    expect(User.partial().is({})).toBe(true);
    expect(User.partial('age').is({})).toBe(false);
    expect(User.required().is({ name: 'a' })).toBe(false);
    expect(User.required().is({ name: 'a', age: 1 })).toBe(true);
    expect(User.keyof().options).toEqual(['name', 'age']);
  });

  it('copies on write when a property is transformed and keeps __proto__ as data', () => {
    const schema = v.object({ name: v.string().trim() });
    const input = JSON.parse('{"name":" a ","__proto__":{"polluted":true}}') as Record<string, unknown>;
    const out = schema.parse(input) as Record<string, unknown>;
    expect(out).not.toBe(input);
    expect(out.name).toBe('a');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(input.name).toBe(' a ');
  });

  it('supports __proto__ as a declared key', () => {
    const schema = v.object({ ['__proto__']: v.string().default('x') });
    const out = schema.parse({}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('applies defaults for missing keys only', () => {
    const schema = v.object({ role: v.string().default('user'), tags: v.array(v.string()).default([]) });
    const a = schema.parse({});
    const b = schema.parse({});
    expect(a).toEqual({ role: 'user', tags: [] });
    expect(a.tags).not.toBe(b.tags); // object defaults are cloned per use
    expect(schema.parse({ role: 'admin', tags: ['x'] })).toEqual({ role: 'admin', tags: ['x'] });
  });

  it('stops at the first issue with abortEarly', () => {
    const schema = v.object({ a: v.string(), b: v.string() });
    expect(schema.safeParse({}, { abortEarly: true }).error?.issues).toHaveLength(1);
    expect(schema.safeParse({}).error?.issues).toHaveLength(2);
  });
});

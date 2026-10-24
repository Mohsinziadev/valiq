import { afterEach, describe, expect, it } from 'vitest';
import { v } from '../src/index';
import { fromJSONSchema } from '../src/json-schema/index';
import { isEmail, isHostname, isIPv6, isURI, isURIReference, isURITemplate, isDuration } from '../src/checks/formats';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

describe('prototype pollution', () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).isAdmin;
  });

  it('never assigns through __proto__ when copying', () => {
    const payload = JSON.parse(
      '{"name":" x ","__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}',
    );
    const schemas = [
      v.object({ name: v.string().trim() }),
      v.object({ name: v.string().trim() }).strip(),
      v.object({ name: v.string().trim() }).catchall(v.unknown()),
      v.record(
        v.string(),
        v.unknown().transform((x) => x),
      ),
      v.intersection([v.object({ name: v.string().trim() }), v.object({})]),
    ];
    for (const schema of schemas) {
      const out = schema.parse(payload) as Record<string, unknown>;
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      expect(out.isAdmin).toBeUndefined();
    }
  });

  it('does not read values from a polluted Object.prototype', () => {
    (Object.prototype as Record<string, unknown>).isAdmin = true;
    const schema = v.object({ isAdmin: v.boolean().default(false) });
    const out = schema.parse({});
    expect(Object.prototype.hasOwnProperty.call(out, 'isAdmin')).toBe(true);
    expect(out.isAdmin).toBe(false);
    expect(v.object({ isAdmin: v.literal(true) }).safeParse({}).error?.issues[0]?.code).toBe('required');
    expect(fromJSONSchema({ required: ['isAdmin'] }).is({})).toBe(false);
  });

  it('handles unusual property names', () => {
    const keys = ['__proto__', 'constructor', 'prototype', 'hasOwnProperty', '', ' ', '0', 'a.b', 'toString'];
    const shape = Object.fromEntries(keys.map((key) => [key, v.number()]));
    const schema = v.object(shape);
    const data = JSON.parse(`{${keys.map((key) => `${JSON.stringify(key)}:1`).join(',')}}`);
    expect(schema.is(data)).toBe(true);
    expect(schema.safeParse({}).error?.issues.map((i) => i.path[0])).toEqual(Object.keys(shape));
    expect(Object.keys(shape)).toHaveLength(keys.length);
  });
});

describe('no mutation', () => {
  it('never mutates input, even with transforms, defaults and strip', () => {
    const schema = v
      .object({
        name: v.string().trim().toLowerCase(),
        tags: v.array(v.string().trim()).default([]),
        nested: v.object({ a: v.number().default(1) }).strip(),
        pair: v.tuple([v.string().trim(), v.number()]),
        dict: v.record(v.string(), v.string().toUpperCase()),
      })
      .strip();
    const input = deepFreeze({ name: ' ADA ', nested: { extra: 1 }, pair: [' a ', 1], dict: { k: 'v' }, extra: true });
    expect(() => schema.parse(input)).not.toThrow();
    expect(schema.parse(input)).toEqual({ name: 'ada', tags: [], nested: { a: 1 }, pair: ['a', 1], dict: { k: 'V' } });
  });
});

describe('resource limits', () => {
  it('rejects oversized arrays without visiting their items', () => {
    let visited = 0;
    const schema = v
      .array(
        v.number().refine(() => {
          visited++;
          return true;
        }),
      )
      .max(10);
    expect(schema.safeParse(new Array(1_000_000).fill(1)).success).toBe(false);
    expect(visited).toBe(0);
    const json = fromJSONSchema({ maxItems: 10, items: { type: 'string' } });
    expect(json.safeParse(new Array(1_000_000).fill(1)).error?.issues).toHaveLength(1);
  });

  it('skips later string checks once max length fails', () => {
    let calls = 0;
    const spy = { test: () => (calls++, true) } as unknown as RegExp;
    const huge = 'a'.repeat(1_000_000);
    const issues = v.string().max(10).regex(spy).safeParse(huge).error!.issues;
    expect(issues.map((i) => i.code)).toEqual(['too_big']);
    expect(calls).toBe(0);
    const json = fromJSONSchema({ maxLength: 10, pattern: '^(a+)+$' }, { regExp: () => spy });
    expect(json.safeParse(huge).error?.issues.map((i) => i.keyword)).toEqual(['maxLength']);
    expect(calls).toBe(0);
  });

  it('caps the number of issues', () => {
    const big = Array.from({ length: 100_000 }, (_, i) => ({ id: i }));
    const started = performance.now();
    const issues = v.array(v.object({ id: v.string() })).safeParse(big).error!.issues;
    expect(issues).toHaveLength(100);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('uniqueItems is linear for large arrays', () => {
    const items = Array.from({ length: 50_000 }, (_, i) => ({ id: i, tags: [i % 7] }));
    const started = performance.now();
    expect(v.array(v.unknown()).unique().is(items)).toBe(true);
    expect(fromJSONSchema({ uniqueItems: true }).is(items)).toBe(true);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('deeply nested data under non-recursive schemas is fine', () => {
    let data: unknown = 1;
    for (let i = 0; i < 100_000; i++) data = [data];
    expect(v.array(v.unknown()).is(data)).toBe(true);
    expect(fromJSONSchema({ const: [[1]] }).is(data)).toBe(false);
    expect(v.array(v.unknown()).unique().is([data, data])).toBe(false);
  });

  it('resets recursion depth after exceptions in user code', () => {
    type Tree = { children: Tree[]; fail?: boolean | undefined };
    const Tree: import('../src/index').Schema<Tree> = v.lazy(() =>
      v.object({ children: v.array(Tree), fail: v.boolean().optional() }).refine((t) => {
        if (t.fail) throw new Error('boom');
        return true;
      }),
    );
    const failing = { children: [{ children: [], fail: true }] };
    for (let i = 0; i < 1000; i++) expect(() => Tree.is(failing)).toThrow('boom');
    expect(Tree.is({ children: [{ children: [{ children: [] }] }] })).toBe(true);
  });
});

describe('ReDoS resistance of built-in formats', () => {
  const attacks: [string, (s: string) => boolean, string][] = [
    ['email', isEmail, `${'a'.repeat(64)}@${'a.'.repeat(90)}!`],
    ['email (no dot)', isEmail, `a@${'a'.repeat(250)}`],
    ['hostname', isHostname, `${'a-'.repeat(120)}!`],
    ['ipv6', isIPv6, '1:'.repeat(40)],
    ['uri', isURI, `http://${'a'.repeat(50_000)}@`],
    ['uri path', isURI, `a:${'/'.repeat(50_000)}\n`],
    ['uri-reference', isURIReference, `${'%00'.repeat(20_000)}%`],
    ['uri-template', isURITemplate, `{${'a.'.repeat(20_000)}`],
    ['duration', isDuration, `P${'1'.repeat(50_000)}`],
  ];
  it.each(attacks)('%s stays fast on adversarial input', (_name, check, input) => {
    const started = performance.now();
    check(input);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('builder string formats reject huge inputs quickly', () => {
    const huge = 'a'.repeat(5_000_000);
    const started = performance.now();
    expect(v.string().email().is(huge)).toBe(false);
    expect(v.string().url().is(huge)).toBe(false);
    expect(v.string().uuid().is(huge)).toBe(false);
    expect(v.string().ipv6().is(huge)).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('coercion is opt-in', () => {
  it('plain schemas never coerce', () => {
    expect(v.number().is('1')).toBe(false);
    expect(v.boolean().is('true')).toBe(false);
    expect(v.string().is(1)).toBe(false);
    expect(v.date().is('2024-01-01')).toBe(false);
    expect(fromJSONSchema({ type: 'integer' }).is('1')).toBe(false);
  });
});

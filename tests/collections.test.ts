import { describe, expect, it } from 'vitest';
import { v, type Schema } from '../src/index';

describe('array', () => {
  it('validates items and reports indexes', () => {
    const schema = v.array(v.number());
    expect(schema.is([1, 2])).toBe(true);
    expect(schema.safeParse([1, 'x', 3, null]).error?.issues.map((i) => i.path)).toEqual([[1], [3]]);
    expect(schema.safeParse('x').error?.issues[0]).toMatchObject({ expected: 'array', received: 'string' });
  });

  it('checks sizes and skips items of oversized arrays', () => {
    const schema = v.array(v.string()).min(1).max(2);
    expect(schema.safeParse([]).error?.issues[0]).toMatchObject({ code: 'too_small', origin: 'array', minimum: 1 });
    const big = schema.safeParse([1, 2, 3]).error?.issues;
    expect(big).toEqual([
      { code: 'too_big', path: [], message: 'Expected at most 2 items', origin: 'array', maximum: 2, inclusive: true },
    ]);
    expect(v.array(v.string()).length(2).safeParse(['a']).error?.issues[0]?.message).toBe('Expected exactly 2 items');
  });

  it('unique() uses deep equality', () => {
    const schema = v.array(v.unknown()).unique();
    expect(schema.is([1, '1', { a: 1 }, { a: 2 }])).toBe(true);
    expect(
      schema.safeParse([
        { a: 1, b: [2] },
        { b: [2], a: 1 },
      ]).error?.issues[0],
    ).toMatchObject({
      code: 'not_unique',
      indexes: [0, 1],
    });
    expect(schema.is([0, -0])).toBe(false);
  });

  it('copies on write and never mutates the input', () => {
    const input = Object.freeze([' a ', 'b']);
    const out = v.array(v.string().trim()).parse(input);
    expect(out).toEqual(['a', 'b']);
    expect(out).not.toBe(input);
    const same = ['a'];
    expect(v.array(v.string().trim()).parse(same)).toBe(same);
  });
});

describe('tuple', () => {
  it('validates positions and length', () => {
    const point = v.tuple([v.number(), v.number()]);
    expect(point.is([1, 2])).toBe(true);
    expect(point.safeParse([1]).error?.issues[0]).toMatchObject({ code: 'too_small', exact: true });
    expect(point.safeParse([1, 2, 3]).error?.issues[0]).toMatchObject({ code: 'too_big', exact: true });
    expect(point.safeParse([1, 'x']).error?.issues[0]?.path).toEqual([1]);
  });

  it('rest() allows extra items', () => {
    const schema = v.tuple([v.string()]).rest(v.number());
    expect(schema.is(['a', 1, 2])).toBe(true);
    expect(schema.is(['a'])).toBe(true);
    expect(schema.safeParse(['a', 1, 'x']).error?.issues[0]?.path).toEqual([2]);
  });
});

describe('record', () => {
  it('validates keys and values', () => {
    const schema = v.record(v.string().regex(/^[a-z]+$/), v.number());
    expect(schema.is({ a: 1, b: 2 })).toBe(true);
    const result = schema.safeParse({ a: 'x', B: 1 });
    expect(result.error?.issues.map((i) => [i.code, i.path])).toEqual([
      ['invalid_type', ['a']],
      ['invalid_key', ['B']],
    ]);
    expect(result.error?.issues[1]).toMatchObject({ message: 'Invalid key: Expected a string matching /^[a-z]+$/' });
  });

  it('works with enum keys', () => {
    const schema = v.record(v.enum(['dev', 'prod']), v.boolean());
    expect(schema.is({ dev: true })).toBe(true);
    expect(schema.is({ test: true })).toBe(false);
  });
});

describe('union', () => {
  const Shape = v.union([
    v.object({ kind: v.literal('circle'), radius: v.number() }),
    v.object({ kind: v.literal('rect'), width: v.number(), height: v.number() }),
  ]);

  it('detects a discriminator and reports issues of the selected member only', () => {
    expect(Shape.discriminator).toBe('kind');
    expect(Shape.is({ kind: 'circle', radius: 1 })).toBe(true);
    expect(Shape.safeParse({ kind: 'rect', width: 1 }).error?.issues).toEqual([
      { code: 'required', path: ['height'], message: 'Required' },
    ]);
    expect(Shape.safeParse({ kind: 'oval' }).error?.issues[0]).toMatchObject({
      code: 'invalid_value',
      path: ['kind'],
      values: ['circle', 'rect'],
    });
    expect(Shape.safeParse(5).error?.issues[0]).toMatchObject({ code: 'invalid_type', expected: 'object' });
  });

  it('reports the informative member when only one passed its type check', () => {
    expect(v.union([v.string().email(), v.number()]).safeParse('x').error?.issues[0]).toMatchObject({
      code: 'invalid_format',
    });
  });

  it('merges type errors when every member failed on type', () => {
    expect(v.union([v.string(), v.number()]).safeParse(true).error?.issues[0]?.message).toBe(
      'Expected string | number, received boolean',
    );
  });

  it('reports every branch otherwise, with absolute paths', () => {
    const schema = v.object({
      value: v.union([v.object({ a: v.string() }), v.object({ b: v.string() })]),
    });
    const issue = schema.safeParse({ value: { a: 1, b: 2 } }).error?.issues[0];
    expect(issue?.code).toBe('invalid_union');
    if (issue?.code !== 'invalid_union') throw new Error('unreachable');
    expect(issue.path).toEqual(['value']);
    expect(issue.branches.map((b) => b.map((i) => i.path))).toEqual([[['value', 'a']], [['value', 'b']]]);
  });

  it('returns the output of the first matching member', () => {
    const schema = v.union([v.string().trim(), v.number()]);
    expect(schema.parse(' x ')).toBe('x');
  });

  it('does not treat refined members as discriminators', () => {
    const schema = v.union([v.object({ t: v.literal('a').refine(() => true) }), v.object({ t: v.literal('b') })]);
    expect(schema.discriminator).toBeUndefined();
    expect(schema.is({ t: 'b' })).toBe(true);
  });
});

describe('intersection', () => {
  it('requires every member and merges object outputs', () => {
    const schema = v.intersection([v.object({ a: v.string().trim() }), v.object({ b: v.number().default(1) })]);
    expect(schema.parse({ a: ' x ' })).toEqual({ a: 'x', b: 1 });
    expect(schema.safeParse({}).error?.issues.map((i) => i.path)).toEqual([['a']]);
    expect(v.intersection([v.string(), v.string().min(2)]).is('a')).toBe(false);
  });
});

describe('lazy', () => {
  interface Category {
    name: string;
    children: Category[];
  }
  const Category: Schema<Category> = v.lazy(() => v.object({ name: v.string(), children: v.array(Category) }));

  it('validates recursive data', () => {
    expect(Category.is({ name: 'a', children: [{ name: 'b', children: [] }] })).toBe(true);
    expect(Category.safeParse({ name: 'a', children: [{ name: 1, children: [] }] }).error?.issues[0]?.path).toEqual([
      'children',
      0,
      'name',
    ]);
  });

  it('stops with too_deep instead of overflowing the stack', () => {
    const root: Category = { name: 'root', children: [] };
    let node = root;
    for (let i = 0; i < 100_000; i++) {
      const child: Category = { name: 'c', children: [] };
      node.children.push(child);
      node = child;
    }
    expect(Category.safeParse(root).error?.issues[0]).toMatchObject({ code: 'too_deep', maxDepth: 512 });
    expect(Category.is(root)).toBe(false);
    expect(Category.safeParse(root, { maxDepth: 10 }).error?.issues[0]).toMatchObject({ maxDepth: 10 });
  });

  it('handles cyclic data', () => {
    const a: Category = { name: 'a', children: [] };
    a.children.push(a);
    expect(Category.safeParse(a).error?.issues[0]?.code).toBe('too_deep');
  });
});

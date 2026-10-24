import { describe, expect, it } from 'vitest';
import { v, type AnySchema } from '../src/index';

function issues(schema: AnySchema, data: unknown) {
  const result = schema.safeParse(data);
  expect(result.success).toBe(false);
  return result.error!.issues;
}

describe('string', () => {
  it('accepts strings and rejects other types with a type name, not the value', () => {
    expect(v.string().parse('hi')).toBe('hi');
    expect(issues(v.string(), 42)).toEqual([
      {
        code: 'invalid_type',
        path: [],
        message: 'Expected string, received number',
        expected: 'string',
        received: 'number',
      },
    ]);
    expect(issues(v.string(), null)[0]!.message).toBe('Expected string, received null');
  });

  it('measures length in code points', () => {
    const s = v.string().min(2).max(3);
    expect(s.is('😀😀')).toBe(true); // 4 UTF-16 units, 2 code points
    expect(s.is('😀')).toBe(false);
    expect(s.is('😀😀😀😀')).toBe(false);
    expect(v.string().length(1).is('😀')).toBe(true);
    expect(v.string().max(1).is('ab')).toBe(false);
    expect(v.string().min(3).is('ab😀')).toBe(true);
  });

  it('reports exact length issues', () => {
    expect(issues(v.string().length(3), 'ab')[0]).toMatchObject({
      code: 'too_small',
      minimum: 3,
      exact: true,
      message: 'Expected exactly 3 characters',
    });
  });

  it('rejects invalid length arguments at definition time', () => {
    expect(() => v.string().min(-1)).toThrow(TypeError);
    expect(() => v.string().max(1.5)).toThrow(TypeError);
  });

  it('ignores lastIndex state of global regexes', () => {
    const s = v.string().regex(/a/g);
    expect([s.is('a'), s.is('a'), s.is('a')]).toEqual([true, true, true]);
    expect(issues(s, 'b')[0]).toMatchObject({ code: 'invalid_pattern', pattern: 'a' });
  });

  it('supports custom messages as strings and functions', () => {
    expect(issues(v.string().min(3, 'Too short'), 'a')[0]!.message).toBe('Too short');
    expect(
      issues(v.string().min(3, { message: (i) => `min ${(i as { minimum: number }).minimum}` }), 'a')[0]!.message,
    ).toBe('min 3');
    expect(issues(v.string({ message: 'Name must be text' }), 1)[0]!.message).toBe('Name must be text');
  });

  it('applies transforms in order', () => {
    const s = v.string().trim().min(2).toLowerCase();
    expect(s.parse('  AB ')).toBe('ab');
    expect(s.safeParse(' a ').success).toBe(false);
    expect(s.is(' a ')).toBe(false);
    expect(v.string().toUpperCase().parse('x')).toBe('X');
  });

  it('collects every failed check', () => {
    expect(issues(v.string().min(5).email(), 'a').map((i) => i.code)).toEqual(['too_small', 'invalid_format']);
  });

  it.each([
    [
      'email',
      ['dev@example.com', 'first.last+tag@sub.example.co.uk', "o'reilly@example.org"],
      [
        'plain',
        'a@b',
        '@example.com',
        'a..b@example.com',
        'a@-example.com',
        'a@example..com',
        `${'a'.repeat(65)}@example.com`,
        'a b@example.com',
      ],
    ],
    [
      'uuid',
      [
        '123e4567-e89b-12d3-a456-426614174000',
        '00000000-0000-0000-0000-000000000000',
        'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
      ],
      ['123e4567e89b12d3a456426614174000', '123e4567-e89b-12d3-a456-42661417400g', ''],
    ],
    ['ipv4', ['127.0.0.1', '255.255.255.255', '0.0.0.0'], ['256.0.0.1', '01.2.3.4', '1.2.3', '1.2.3.4.5', ' 1.2.3.4']],
    [
      'ipv6',
      ['::1', '::', '2001:db8::8a2e:370:7334', '::ffff:192.0.2.1', '1:2:3:4:5:6:7:8'],
      ['1:2:3:4:5:6:7:8:9', '1::2::3', '12345::', ':::', '::ffff:999.0.0.1', 'fe80::1%eth0'],
    ],
    [
      'hostname',
      ['example.com', 'localhost', 'a-b.c', 'xn--nxasmq6b.com'],
      ['-example.com', 'example-.com', 'ex_ample.com', 'a..b', `${'a'.repeat(64)}.com`, 'ab--cd.com'],
    ],
    ['isoDate', ['2024-02-29', '1999-12-31'], ['2023-02-29', '2024-13-01', '2024-1-01', '2024-04-31', '20240101']],
    ['isoTime', ['00:00', '23:59', '23:59:59', '12:30:45.123'], ['24:00', '12:60', '12:30:60', '1:00', '12:30:45.']],
  ] as const)('%s format', (method, valid, invalid) => {
    const schema = (v.string() as unknown as Record<string, () => { is(x: unknown): boolean }>)[method]!.call(
      v.string(),
    );
    for (const value of valid) expect(schema.is(value), value).toBe(true);
    for (const value of invalid) expect(schema.is(value), value).toBe(false);
  });

  it('isoDateTime requires an offset unless local', () => {
    const strict = v.string().isoDateTime();
    expect(strict.is('2024-05-01T12:00:00Z')).toBe(true);
    expect(strict.is('2024-05-01T12:00:00.5+05:30')).toBe(true);
    expect(strict.is('2024-05-01T12:00:00')).toBe(false);
    expect(strict.is('2024-05-01 12:00:00Z')).toBe(false);
    const local = v.string().isoDateTime({ local: true });
    expect(local.is('2024-05-01T12:00')).toBe(true);
    expect(local.is('2024-05-01T12:00:00Z')).toBe(false);
  });

  it('url accepts http(s) by default and rejects scripts', () => {
    const url = v.string().url();
    expect(url.is('https://example.com/a?b=c#d')).toBe(true);
    expect(url.is('http://localhost:3000')).toBe(true);
    expect(url.is('javascript:alert(1)')).toBe(false);
    expect(url.is('ftp://example.com')).toBe(false);
    expect(url.is('https://exa mple.com')).toBe(false);
    expect(url.is('/relative')).toBe(false);
    expect(
      v
        .string()
        .url({ protocols: ['ftp', 'mailto:'] })
        .is('mailto:dev@example.com'),
    ).toBe(true);
  });

  it('startsWith / endsWith / includes', () => {
    expect(v.string().startsWith('sk_').is('sk_123')).toBe(true);
    expect(v.string().startsWith('sk_').is('pk_123')).toBe(false);
    expect(v.string().endsWith('.json').is('a.json')).toBe(true);
    expect(v.string().includes('@').is('ab')).toBe(false);
  });
});

describe('number', () => {
  it('rejects NaN and infinities', () => {
    expect(issues(v.number(), NaN)[0]!.message).toBe('Expected number, received NaN');
    expect(v.number().is(Infinity)).toBe(false);
    expect(v.number().is(-Infinity)).toBe(false);
    expect(v.number().is('1')).toBe(false);
    expect(v.number().is(-0)).toBe(true);
  });

  it('checks bounds', () => {
    const n = v.number().min(1).max(10);
    expect(n.is(1) && n.is(10)).toBe(true);
    expect(issues(n, 0)[0]).toMatchObject({ code: 'too_small', minimum: 1, inclusive: true });
    expect(issues(v.number().gt(0), 0)[0]).toMatchObject({
      code: 'too_small',
      minimum: 0,
      inclusive: false,
      message: 'Expected a number greater than 0',
    });
    expect(issues(v.number().lt(5), 5)[0]).toMatchObject({ code: 'too_big', maximum: 5, inclusive: false });
  });

  it('int', () => {
    expect(v.number().int().is(3)).toBe(true);
    expect(issues(v.number().int(), 3.5)[0]).toMatchObject({
      code: 'invalid_type',
      expected: 'integer',
      received: 'number',
    });
    expect(issues(v.number().int(), 'x')[0]).toMatchObject({ expected: 'integer', received: 'string' });
  });

  it('multipleOf is tolerant of decimal divisors', () => {
    expect(v.number().multipleOf(0.1).is(0.3)).toBe(true);
    expect(v.number().multipleOf(0.01).is(19.99)).toBe(true);
    expect(v.number().multipleOf(0.01).is(19.991)).toBe(false);
    expect(v.number().multipleOf(3).is(9)).toBe(true);
    expect(v.number().multipleOf(3).is(10)).toBe(false);
    expect(v.number().multipleOf(0.0001).is(0.0075)).toBe(true);
    expect(() => v.number().multipleOf(0)).toThrow(TypeError);
  });

  it('rejects invalid bounds at definition time', () => {
    expect(() => v.number().min(NaN)).toThrow(TypeError);
  });
});

describe('other primitives', () => {
  it('boolean', () => {
    expect(v.boolean().is(false)).toBe(true);
    expect(v.boolean().is(0)).toBe(false);
  });

  it('date accepts valid Date instances only', () => {
    expect(v.date().is(new Date())).toBe(true);
    expect(issues(v.date(), new Date('nope'))[0]).toMatchObject({
      code: 'invalid_type',
      expected: 'Date',
      received: 'Date',
    });
    expect(v.date().is('2024-01-01')).toBe(false);
    const range = v.date().min('2024-01-01').max(new Date('2024-12-31'));
    expect(range.is(new Date('2024-06-01'))).toBe(true);
    expect(issues(range, new Date('2023-06-01'))[0]!.message).toBe(
      'Expected a date on or after 2024-01-01T00:00:00.000Z',
    );
  });

  it('literal', () => {
    expect(v.literal('a').is('a')).toBe(true);
    expect(issues(v.literal('a'), 'b')[0]).toMatchObject({
      code: 'invalid_value',
      values: ['a'],
      message: 'Expected "a"',
    });
    expect(v.literal(null).is(null)).toBe(true);
    expect(v.literal(1).is(1)).toBe(true);
    expect(() => v.literal(NaN)).toThrow(TypeError);
  });

  it('enum from a list', () => {
    const Role = v.enum(['admin', 'user']);
    expect(Role.is('admin')).toBe(true);
    expect(issues(Role, 'root')[0]!.message).toBe('Expected one of "admin", "user"');
    expect(Role.enum.admin).toBe('admin');
    expect(Role.options).toEqual(['admin', 'user']);
  });

  it('enum from a TypeScript enum ignores numeric reverse mappings', () => {
    enum Color {
      Red,
      Green = 'green',
    }
    const schema = v.enum(Color);
    expect(schema.options).toEqual([0, 'green']);
    expect(schema.is(Color.Red)).toBe(true);
    expect(schema.is('Red')).toBe(false);
  });

  it('null, undefined, unknown, never', () => {
    expect(v.null().is(null)).toBe(true);
    expect(v.null().is(undefined)).toBe(false);
    expect(v.undefined().is(undefined)).toBe(true);
    expect(v.unknown().is(Symbol())).toBe(true);
    expect(issues(v.never(), 1)[0]).toMatchObject({ code: 'invalid_type', expected: 'never' });
  });

  it('instance', () => {
    expect(v.instance(URL).is(new URL('https://example.com'))).toBe(true);
    expect(issues(v.instance(URL), 'https://example.com')[0]).toMatchObject({ expected: 'URL', received: 'string' });
  });

  it('custom', () => {
    const bytes = v.custom<Uint8Array>((x) => x instanceof Uint8Array, 'Expected bytes');
    expect(bytes.is(new Uint8Array(2))).toBe(true);
    expect(issues(bytes, [])[0]).toMatchObject({ code: 'custom', message: 'Expected bytes' });
  });
});

describe('coerce', () => {
  it('number accepts decimal strings only', () => {
    const n = v.coerce.number();
    expect(n.parse('42')).toBe(42);
    expect(n.parse(' -1.5e3 ')).toBe(-1500);
    expect(n.parse(7)).toBe(7);
    for (const bad of ['', ' ', '0x10', '1,000', 'abc', 'Infinity', null, true, []])
      expect(n.is(bad), String(bad)).toBe(false);
    expect(v.coerce.number().int().min(1).parse('3')).toBe(3);
    expect(issues(v.coerce.number(), 'x')[0]).toMatchObject({ code: 'invalid_type', received: 'string' });
  });

  it('boolean accepts explicit spellings only', () => {
    const b = v.coerce.boolean();
    expect([b.parse('true'), b.parse('FALSE'), b.parse('1'), b.parse('0'), b.parse(1), b.parse(false)]).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    for (const bad of ['yes', '', 'on', 2, null]) expect(b.is(bad), String(bad)).toBe(false);
  });

  it('date accepts strings and timestamps that make valid dates', () => {
    expect(v.coerce.date().parse('2024-01-01T00:00:00Z').toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(v.coerce.date().parse(0).getTime()).toBe(0);
    expect(v.coerce.date().is('not a date')).toBe(false);
  });
});

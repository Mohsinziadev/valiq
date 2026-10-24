// Equivalent schemas for each library. Every variant accepts unknown keys (Ajv's and JSON Schema's
// default), so none of them copies the input, and all collect every error on invalid input.
import Ajv from 'ajv';
import * as valibot from 'valibot';
import * as z from 'zod';
import { v } from '../dist/index.js';
import { fromJSONSchema } from '../dist/json-schema/index.js';

export const userJSONSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    active: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    address: {
      type: 'object',
      properties: { city: { type: 'string' }, zip: { type: 'string', pattern: '^\\d{5}$' } },
      required: ['city', 'zip'],
    },
  },
  required: ['id', 'age', 'active', 'tags', 'address'],
};

export const eventJSONSchema = {
  oneOf: [
    {
      type: 'object',
      properties: { type: { const: 'click' }, x: { type: 'number' }, y: { type: 'number' } },
      required: ['type', 'x', 'y'],
    },
    { type: 'object', properties: { type: { const: 'key' }, key: { type: 'string' } }, required: ['type', 'key'] },
    {
      type: 'object',
      properties: { type: { const: 'scroll' }, delta: { type: 'number' } },
      required: ['type', 'delta'],
    },
  ],
};

export function makeValiq() {
  const user = v.object({
    id: v.string().min(1),
    age: v.number().int().min(0).max(150),
    active: v.boolean(),
    tags: v.array(v.string()).max(10),
    address: v.object({ city: v.string(), zip: v.string().regex(/^\d{5}$/) }),
  });
  const event = v.union([
    v.object({ type: v.literal('click'), x: v.number(), y: v.number() }),
    v.object({ type: v.literal('key'), key: v.string() }),
    v.object({ type: v.literal('scroll'), delta: v.number() }),
  ]);
  return { user, users: v.array(user), events: v.array(event) };
}

export function makeValiqJSON() {
  return {
    user: fromJSONSchema(userJSONSchema),
    users: fromJSONSchema({ type: 'array', items: userJSONSchema }),
    events: fromJSONSchema({ type: 'array', items: eventJSONSchema }),
  };
}

export function makeAjv(allErrors) {
  const ajv = new Ajv({ allErrors });
  return {
    user: ajv.compile(userJSONSchema),
    users: ajv.compile({ type: 'array', items: userJSONSchema }),
    events: ajv.compile({ type: 'array', items: eventJSONSchema }),
  };
}

export function makeZod() {
  const user = z.looseObject({
    id: z.string().min(1),
    age: z.int().min(0).max(150),
    active: z.boolean(),
    tags: z.array(z.string()).max(10),
    address: z.looseObject({ city: z.string(), zip: z.string().regex(/^\d{5}$/) }),
  });
  const event = z.discriminatedUnion('type', [
    z.looseObject({ type: z.literal('click'), x: z.number(), y: z.number() }),
    z.looseObject({ type: z.literal('key'), key: z.string() }),
    z.looseObject({ type: z.literal('scroll'), delta: z.number() }),
  ]);
  return { user, users: z.array(user), events: z.array(event) };
}

export function makeValibot() {
  const user = valibot.looseObject({
    id: valibot.pipe(valibot.string(), valibot.minLength(1)),
    age: valibot.pipe(valibot.number(), valibot.integer(), valibot.minValue(0), valibot.maxValue(150)),
    active: valibot.boolean(),
    tags: valibot.pipe(valibot.array(valibot.string()), valibot.maxLength(10)),
    address: valibot.looseObject({
      city: valibot.string(),
      zip: valibot.pipe(valibot.string(), valibot.regex(/^\d{5}$/)),
    }),
  });
  const event = valibot.variant('type', [
    valibot.looseObject({ type: valibot.literal('click'), x: valibot.number(), y: valibot.number() }),
    valibot.looseObject({ type: valibot.literal('key'), key: valibot.string() }),
    valibot.looseObject({ type: valibot.literal('scroll'), delta: valibot.number() }),
  ]);
  return { user, users: valibot.array(user), events: valibot.array(event) };
}

export const validUser = {
  id: 'usr_1',
  age: 42,
  active: true,
  tags: ['a', 'b'],
  address: { city: 'Lahore', zip: '54000' },
};
export const invalidUser = { id: '', age: -1, active: 'yes', tags: ['a', 2], address: { city: 'Lahore', zip: 'x' } };
export const users = Array.from({ length: 1000 }, (_, i) => ({ ...validUser, id: `usr_${i}`, tags: [`t${i % 10}`] }));
export const events = Array.from({ length: 300 }, (_, i) =>
  i % 3 === 0 ? { type: 'click', x: i, y: i } : i % 3 === 1 ? { type: 'key', key: 'k' } : { type: 'scroll', delta: i },
);

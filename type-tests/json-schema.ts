import { fromJSONSchema, type FromSchema } from '../src/json-schema/index';
import type { Infer } from '../src/index';
import { assertType, type Equal } from './helpers';

const Product = fromJSONSchema({
  type: 'object',
  properties: {
    id: { type: 'string' },
    price: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
    status: { enum: ['draft', 'live'] },
    dims: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], items: false },
    parent: { type: ['string', 'null'] },
    variant: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
    meta: { $ref: '#/$defs/meta' },
  },
  required: ['id', 'price'],
  additionalProperties: false,
  $defs: { meta: { type: 'object', properties: { createdBy: { const: 'system' } }, required: ['createdBy'] } },
} as const);

type Product = Infer<typeof Product>;
assertType<
  Equal<
    Product,
    {
      id: string;
      price: number;
      tags?: string[];
      status?: 'draft' | 'live';
      dims?: [number, number];
      parent?: string | null;
      variant?: string | number;
      meta?: { createdBy: 'system' };
    }
  >
>();

assertType<Equal<FromSchema<true>, unknown>>();
assertType<Equal<FromSchema<false>, never>>();
assertType<
  Equal<FromSchema<{ type: 'object'; additionalProperties: { type: 'number' } }>, { [key: string]: number }>
>();
assertType<Equal<FromSchema<{ minLength: 1 }>, unknown>>();

const loose = fromJSONSchema({ type: 'string' } as Record<string, unknown>);
assertType<Equal<Infer<typeof loose>, unknown>>();
const typed = loose.typed<{ id: string }>();
assertType<Equal<Infer<typeof typed>, { id: string }>>();

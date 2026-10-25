import { fromJSONSchema } from 'valiq/json-schema';

export const Product = fromJSONSchema({
  type: 'object',
  properties: {
    sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
    name: { type: 'string', maxLenght: 80 },
  },
  required: ['sku'],
});
// JSONSchemaError: Unknown keyword "maxLenght" (did you mean "maxLength"?)

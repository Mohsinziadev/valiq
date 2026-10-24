// Type-level regression tests, checked by `npm run test:types` (tsc, strict, exactOptionalPropertyTypes).
import { v, type Brand, type Infer, type Input, type Schema, type StandardSchemaV1 } from '../src/index';
import { assertType, type Equal, type Same } from './helpers';

// Primitives
assertType<Equal<Infer<ReturnType<typeof v.string>>, string>>();
assertType<Equal<v.Infer<ReturnType<typeof v.number>>, number>>();
const lit = v.literal('on');
assertType<Equal<Infer<typeof lit>, 'on'>>();
const role = v.enum(['admin', 'user']);
assertType<Equal<Infer<typeof role>, 'admin' | 'user'>>();
enum Status {
  Active = 'active',
  Off = 0,
}
const status = v.enum(Status);
assertType<Same<Infer<typeof status>, Status>>(); // Status.Active | Status.Off
const nul = v.null();
assertType<Equal<Infer<typeof nul>, null>>();

// Objects: required vs optional keys, nested inference
const User = v.object({
  id: v.string(),
  age: v.number().optional(),
  nick: v.string().nullable(),
  tags: v.array(v.string()),
  address: v.object({ city: v.string(), zip: v.string().optional() }),
  role: v.enum(['admin', 'user']).default('user'),
});
type User = Infer<typeof User>;
assertType<
  Equal<
    User,
    {
      id: string;
      nick: string | null;
      tags: string[];
      address: { city: string; zip?: string | undefined };
      role: 'admin' | 'user';
      age?: number | undefined;
    }
  >
>();
type UserInput = Input<typeof User>;
assertType<Equal<UserInput['role'], 'admin' | 'user' | undefined>>();
assertType<Equal<{} extends Pick<UserInput, 'role'> ? true : false, true>>();

// Object helpers
const Picked = User.pick('id', 'age');
assertType<Equal<Infer<typeof Picked>, { id: string; age?: number | undefined }>>();
const Omitted = User.omit('address', 'tags', 'role', 'nick');
assertType<Equal<Infer<typeof Omitted>, { id: string; age?: number | undefined }>>();
const Partial = v.object({ a: v.string(), b: v.number() }).partial('a');
assertType<Equal<Infer<typeof Partial>, { b: number; a?: string | undefined }>>();
const Required = v.object({ a: v.string().optional() }).required();
assertType<Equal<Infer<typeof Required>, { a: string }>>();
const Extended = v.object({ a: v.string() }).extend({ a: v.number(), b: v.boolean() });
assertType<Equal<Infer<typeof Extended>, { a: number; b: boolean }>>();
const Catchall = v.object({ a: v.string() }).catchall(v.number());
assertType<Equal<Infer<typeof Catchall>['other'], number>>();
const keys = User.keyof();
assertType<Equal<Infer<typeof keys>, 'id' | 'age' | 'nick' | 'tags' | 'address' | 'role'>>();

// Collections
const tuple = v.tuple([v.string(), v.number()]);
assertType<Equal<Infer<typeof tuple>, [string, number]>>();
const rest = v.tuple([v.string()]).rest(v.boolean());
assertType<Equal<Infer<typeof rest>, [string, ...boolean[]]>>();
const dict = v.record(v.string(), v.number());
assertType<Equal<Infer<typeof dict>, Record<string, number>>>();
const flags = v.record(v.enum(['a', 'b']), v.boolean());
assertType<Equal<Infer<typeof flags>, Partial<Record<'a' | 'b', boolean>>>>();

// Unions and intersections
const Shape = v.union([
  v.object({ kind: v.literal('circle'), r: v.number() }),
  v.object({ kind: v.literal('square'), side: v.number() }),
]);
type Shape = Infer<typeof Shape>;
assertType<Equal<Shape, { kind: 'circle'; r: number } | { kind: 'square'; side: number }>>();
declare const shape: Shape;
if (shape.kind === 'circle') {
  assertType<Equal<typeof shape.r, number>>();
}
const both = v.intersection([v.object({ a: v.string() }), v.object({ b: v.number() })]);
assertType<Equal<Infer<typeof both>, { a: string } & { b: number }>>();

// Wrappers: transform / pipe / default / brand / nullish
const length = v.string().transform((s) => s.length);
assertType<Equal<Infer<typeof length>, number>>();
assertType<Equal<Input<typeof length>, string>>();
const piped = v.string().transform(Number).pipe(v.number().int());
assertType<Equal<Infer<typeof piped>, number>>();
const withDefault = v.number().default(1);
assertType<Equal<Infer<typeof withDefault>, number>>();
assertType<Equal<Input<typeof withDefault>, number | undefined>>();
const nullish = v.string().nullish();
assertType<Equal<Infer<typeof nullish>, string | null | undefined>>();
const UserId = v.string().brand<'UserId'>();
type UserId = Infer<typeof UserId>;
assertType<Equal<UserId, string & Brand<'UserId'>>>();
// @ts-expect-error -- a plain string is not a branded UserId
const notAnId: UserId = 'abc';
const refined = v
  .string()
  .refine((s) => s.length > 1)
  .min(2);
assertType<Equal<Infer<typeof refined>, string>>();
const coerced = v.coerce.number().int();
assertType<Equal<Infer<typeof coerced>, number>>();

// Results and guards
const result = User.safeParse({});
if (result.success) {
  assertType<Equal<typeof result.data, User>>();
} else {
  assertType<Equal<(typeof result.error.issues)[number]['path'], (string | number)[]>>();
}
declare const unknownValue: unknown;
if (v.string().is(unknownValue)) {
  assertType<Equal<typeof unknownValue, string>>();
}
const parsed: User = User.parse(unknownValue);

// Issue codes narrow the issue type
const issue = result.error?.issues[0];
if (issue?.code === 'too_small') {
  assertType<Equal<typeof issue.minimum, number>>();
}

// Recursive schemas with an explicit annotation
interface Category {
  name: string;
  children: Category[];
}
const Category: Schema<Category> = v.lazy(() => v.object({ name: v.string(), children: v.array(Category) }));
assertType<Equal<Infer<typeof Category>, Category>>();

// Standard Schema interop
assertType<Equal<StandardSchemaV1.InferOutput<typeof User>, User>>();
const asStandard: StandardSchemaV1<unknown, User> = User;

// Misuse is rejected at compile time
// @ts-expect-error -- min() takes a number
v.string().min('3');
// @ts-expect-error -- pick() only accepts declared keys
User.pick('nope');
// @ts-expect-error -- default must match the output type
v.number().default('1');
// @ts-expect-error -- number schemas have no email()
v.number().email();
// @ts-expect-error -- record keys must be string schemas
v.record(v.number(), v.string());
// @ts-expect-error -- refine receives the typed value
v.number().refine((n: string) => n.length > 0);

void [notAnId, parsed, asStandard];

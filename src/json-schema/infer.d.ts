type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};
type Depth = readonly unknown[];
type MaxDepth = 8;
/** The TypeScript type of data accepted by the JSON Schema `S`. */
export type FromSchema<S> = Node<S, S, []>;
type Node<S, R, D extends Depth> = D['length'] extends MaxDepth
  ? unknown
  : S extends true
    ? unknown
    : S extends false
      ? never
      : S extends {
            readonly const: infer C;
          }
        ? C
        : S extends {
              readonly enum: readonly (infer E)[];
            }
          ? E
          : Combine<S, R, D>;
type Combine<S, R, D extends Depth> = Typed<S, R, D> &
  (S extends {
    readonly $ref: infer Ref extends string;
  }
    ? RefTarget<Ref, R, D>
    : unknown) &
  (S extends {
    readonly anyOf: infer A extends readonly unknown[];
  }
    ? Union<A, R, D>
    : unknown) &
  (S extends {
    readonly oneOf: infer A extends readonly unknown[];
  }
    ? Union<A, R, D>
    : unknown) &
  (S extends {
    readonly allOf: infer A extends readonly unknown[];
  }
    ? Intersection<A, R, D>
    : unknown);
type Union<A extends readonly unknown[], R, D extends Depth> = {
  [K in keyof A]: Node<A[K], R, D>;
}[number];
type Intersection<A extends readonly unknown[], R, D extends Depth> = A extends readonly [infer H, ...infer T]
  ? Node<H, R, D> & Intersection<T, R, D>
  : unknown;
type RefTarget<Ref extends string, R, D extends Depth> = Ref extends '#'
  ? Node<R, R, [...D, 1]>
  : Ref extends `#/$defs/${infer Name}`
    ? R extends {
        readonly $defs: {
          readonly [K in Name]: infer T;
        };
      }
      ? Node<T, R, [...D, 1]>
      : unknown
    : Ref extends `#/definitions/${infer Name}`
      ? R extends {
          readonly definitions: {
            readonly [K in Name]: infer T;
          };
        }
        ? Node<T, R, [...D, 1]>
        : unknown
      : unknown;
type Typed<S, R, D extends Depth> = S extends {
  readonly type: infer T;
}
  ? T extends readonly (infer Name)[]
    ? Name extends string
      ? TypeOf<Name, S, R, D>
      : never
    : T extends string
      ? TypeOf<T, S, R, D>
      : unknown
  : unknown;
type TypeOf<Name extends string, S, R, D extends Depth> = Name extends 'string'
  ? string
  : Name extends 'number' | 'integer'
    ? number
    : Name extends 'boolean'
      ? boolean
      : Name extends 'null'
        ? null
        : Name extends 'array'
          ? ArrayOf<S, R, D>
          : Name extends 'object'
            ? ObjectOf<S, R, D>
            : never;
type ArrayOf<S, R, D extends Depth> = S extends {
  readonly prefixItems: infer P extends readonly unknown[];
}
  ? [
      ...{
        -readonly [K in keyof P]: Node<P[K], R, D>;
      },
      ...(S extends {
        readonly items: false;
      }
        ? []
        : S extends {
              readonly items: infer I;
            }
          ? Node<I, R, D>[]
          : unknown[]),
    ]
  : S extends {
        readonly items: infer I;
      }
    ? I extends readonly unknown[]
      ? unknown[]
      : Node<I, R, D>[]
    : unknown[];
type RequiredKeys<S> = S extends {
  readonly required: readonly (infer K extends string)[];
}
  ? K
  : never;
type ObjectOf<S, R, D extends Depth> = S extends {
  readonly properties: infer P;
}
  ? Simplify<
      {
        -readonly [K in keyof P & RequiredKeys<S>]: Node<P[K], R, D>;
      } & {
        -readonly [K in Exclude<keyof P, RequiredKeys<S>>]?: Node<P[K], R, D>;
      } & {
        -readonly [K in Exclude<RequiredKeys<S>, keyof P>]: unknown;
      }
    >
  : S extends {
        readonly additionalProperties: infer A;
      }
    ? A extends false
      ? {
          [K in RequiredKeys<S>]: unknown;
        }
      : Simplify<
          {
            [key: string]: Node<A, R, D>;
          } & {
            [K in RequiredKeys<S>]: Node<A, R, D>;
          }
        >
    : Simplify<
        {
          [key: string]: unknown;
        } & {
          [K in RequiredKeys<S>]: unknown;
        }
      >;
export {};

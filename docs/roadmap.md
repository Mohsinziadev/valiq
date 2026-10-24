# Status and roadmap

## Complete in 0.1

- Builder API: primitives, string formats and transforms, objects (strict/strip/catchall and shape
  helpers), arrays, tuples, records, unions with automatic discriminators, intersections, lazy
  recursion, `instance`, `custom`, strict coercion, `optional`/`nullable`/`default`/`refine`/
  `transform`/`pipe`/`brand`/`meta`.
- Structured issues, `ValiqError` (`flatten`, `format`), custom and localised messages.
- JSON Schema 2020-12, 2019-09 and draft-07 validation, with zero failures on the runnable parts
  of the official test suite; strict schema checking; type inference from `as const` schemas.
- JSON Schema export (2020-12, draft-07) and Standard Schema / Standard JSON Schema support.
- Resource limits, prototype-pollution-safe copying, ReDoS-resistant built-in formats.

## Partial

- **Formats:** the internationalised formats (`idn-email`, `idn-hostname`, `iri`,
  `iri-reference`) are not built in, and `hostname` does not validate punycode labels.
- **JSON Schema export:** refinements and post-transform string checks are not represented; no
  OpenAPI 3.0 target.
- **Type inference from JSON Schema:** covers the common keywords and local `$ref`s; other
  constructs infer as `unknown` (use `.typed<T>()`).
- **Runtimes:** verified on Node.js 22. The CI workflow is set up for Node.js 18, 20, 22 and 24
  but has not run yet. Browsers, Deno, Bun and edge runtimes use only standard APIs but are not
  tested automatically.

## Not supported

- `unevaluatedProperties`, `unevaluatedItems`, `$dynamicRef`, `$recursiveRef` (rejected at compile
  time), draft-04 and older, fetching remote schemas.
- Asynchronous refinements and transforms.
- Data rewriting from JSON Schema (`default` application, type coercion, removing additional
  properties).

## Planned (in rough priority order, not promises)

1. `unevaluatedProperties` / `unevaluatedItems` (annotation tracking), then `$dynamicRef`.
2. Async validation (`parseAsync`) for refinements that need I/O.
3. An OpenAPI 3.0 target for `toJSONSchema`, and `nullable` support when reading OpenAPI schemas.
4. Browser and Deno/Bun test runs in CI.
5. Message packs for common languages, as a separate entry point.
6. Optional ahead-of-time code generation for hot paths, kept separate from the CSP-safe default.

# Troubleshooting and FAQ

**`Unknown keyword "..."` when calling `fromJSONSchema`.** Strict mode rejects keywords that are
not part of the dialect, which usually means a typo. If the keyword is intentional (vendor
metadata), prefix it with `x-` or pass `{ strict: false }`.

**`Unknown format "..."`.** Register it with `customFormats: { name: /regex/ }`, or ignore formats
with `{ formats: 'annotate' }`.

**`Cannot resolve $ref "https://..."`.** valiq-js never downloads schemas. Pass the referenced
document in `schemas: [document]` (it needs an `$id`) or `schemas: { 'https://...': document }`.

**`unevaluatedProperties is not supported yet`.** Rewrite with `additionalProperties`, or wrap
the shared parts with `allOf` and list every allowed property. valiq-js refuses these schemas rather
than validating them incompletely.

**My object type has `prop?: string | undefined` instead of `prop?: string`.** That matches
runtime behaviour: `.optional()` accepts an explicit `undefined`. With
`exactOptionalPropertyTypes`, write your interfaces the same way when you annotate a schema.

**`Type instantiation is excessively deep` with recursive schemas.** Annotate the recursive
variable: `const Node: Schema<Node> = v.lazy(() => ...)`.

**`v.number()` rejects `"42"` from a form or query string.** Use `v.coerce.number()`.

**Unknown keys appear in my output.** That is the default. Use `.strip()` to remove them or
`.strict()` to reject them.

**My cross-field `refine` doesn't run.** Refinements on an object run only when all of its
properties are valid.

**`too_deep` on legitimate data.** Raise the limit per call:
`schema.safeParse(data, { maxDepth: 2000 })`. Very high values can overflow the call stack.

**Only 100 issues are reported.** `maxIssues` defaults to 100; pass a higher value if you need
more.

**Is the output the same object as the input?** Yes, unless something changed it (a default, a
transform, `.strip()` with unknown keys, coercion). Then the changed objects are copies and the
input is untouched.

**Can I validate asynchronously?** Not in 0.1. Refinements and transforms are synchronous. Run
async checks (such as database lookups) after validation.

**Does valiq-js work in the browser?** Yes. It uses standard JavaScript only and has no
dependencies. Import `valiq-js/json-schema` only if you need it, so bundlers can leave it out.

**Why are there two email rules?** `v.string().email()` is what web forms usually want (no quoted
local parts, a dot in the domain). JSON Schema's `email` format is defined by RFC 5321 and allows
more, so `fromJSONSchema` follows the standard.

**How do I report a bug or a security issue?** Bugs: the project's issue tracker. Security
issues: privately, as described in [SECURITY.md](../SECURITY.md).

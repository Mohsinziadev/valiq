# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Before 1.0, breaking changes bump the minor version.

## [0.1.0] - 2026-10-25

First release.

### Added

- Builder API (`v`): strings with formats and transforms, numbers, booleans, dates, literals,
  enums (including TypeScript enums), objects with strict/strip/catchall modes and shape helpers,
  arrays, tuples with rest items, records, unions with automatic discriminator detection,
  intersections, recursive schemas, `instance`, `custom`, and strict `coerce` conversions.
- `parse`, `safeParse` and `is` on every schema; `optional`, `nullable`, `nullish`, `default`,
  `refine`, `transform`, `pipe`, `brand` and `meta` wrappers.
- Structured issues with stable codes, exact paths and constraint details; `ValiqError` with
  `flatten()` and `format()`; per-check messages and a `messages` option for localisation.
- `valiq/json-schema`: `fromJSONSchema` for draft 2020-12, 2019-09 and draft-07 with strict
  keyword checking, 15 formats, custom formats, registered remote schemas and type inference from
  `as const` schemas. Passes every runnable test of the official JSON-Schema-Test-Suite (required
  suites); `unevaluated*`, `$dynamicRef` and `$recursiveRef` are rejected as unsupported.
- `toJSONSchema` for 2020-12 and draft-07, with input/output modes.
- Standard Schema v1 and Standard JSON Schema v1 support.
- Resource limits (`maxDepth`, `maxIssues`), prototype-pollution-safe copying, linear-time
  built-in formats.

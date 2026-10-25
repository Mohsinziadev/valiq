# Contributing to valiq-js

Thanks for helping. Bug reports with a minimal reproduction are as valuable as code.

## Setup

```sh
npm install
npm test            # unit, integration, property-based and JSON Schema conformance tests
npm run test:types  # type-level tests (tsc)
npm run lint
npm run build
```

Node.js 20 or later is needed for development (the published package supports Node.js 18+).

## Before opening a pull request

Run `npm run verify`. It runs everything CI runs: lint, formatting, type checks, type tests, unit
tests, the build, package checks (publint, arethetypeswrong), the bundle-size budget, a smoke test
of the packed tarball, documentation code blocks and the examples.

## Guidelines

- **Correctness first.** Every new check needs tests for valid input, invalid input and the exact
  issue it reports. JSON Schema changes should keep the conformance suite at zero failures
  (`npm run conformance`).
- **Errors are API.** Issue codes and fields are covered by semver. Messages must never contain
  the input value.
- **No runtime dependencies**, and no `eval` or `new Function`.
- **Security.** Regular expressions in the library must be linear-time; add an adversarial case
  to `tests/security.test.ts` for new formats.
- **Performance claims** must come with a benchmark in `benchmarks/` that others can run.
- **Docs.** Update the relevant page in `docs/` and the README. `ts` code blocks are type-checked
  (`npm run docs:check`); use `tsx` or `js` for illustrative snippets that need other packages.
- Add an entry to `CHANGELOG.md` under "Unreleased".

## Project layout

```
src/core/          base schema class, validation context, issues, errors, Standard Schema types
src/schemas/       builder schema types
src/checks/        format and value checks shared by both engines
src/json-schema/   JSON Schema compiler and type inference (valiq/json-schema)
src/to-json-schema.ts  JSON Schema export
tests/             vitest suites; fixtures/ holds the vendored JSON-Schema-Test-Suite
type-tests/        compile-time tests
benchmarks/        benchmark workloads and runner
examples/          runnable examples (executed by the tests)
scripts/           build, size, smoke test, docs and conformance tooling
demo/              documentation site and landing page (m2toolkit.com/npm-packages/valiq-js)
```

## Updating the JSON Schema test suite

The suite is vendored in `tests/fixtures/json-schema-test-suite` (commit in `COMMIT`). To update
it, copy `tests/draft2020-12`, `tests/draft2019-09`, `tests/draft7` and `remotes` from a newer
checkout of https://github.com/json-schema-org/JSON-Schema-Test-Suite, update `COMMIT`, and run
`npm run conformance`.

## Landing page

The documentation site at https://www.m2toolkit.com/npm-packages/valiq-js is built from `demo/` (Vite
and React; neither is a dependency of the package).

- `npm run dev:site` starts it locally; `npm run typecheck:site` type-checks it.
- The docs pages are rendered from `docs/*.md` at build time (`demo/content-plugin.ts`), so editing
  a page in `docs/` updates the site. The sidebar order lives in `demo/src/docs-nav.ts`; add a new
  page there.
- Code on the landing page and in the playground comes from `demo/snippets/`. Those files are real
  modules: the playground runs the same files it displays.
- `npm run build:site` prerenders the page into `site-dist/` with SEO tags and listing data.
  `scripts/build-site.mjs` is shared by every package on m2toolkit.com/npm-packages; per-package
  settings live in `site.config.json`. M2Toolkit pulls the page in with
  `npm run sync:packages -- --only valiq-js` (see its `docs/NPM-PACKAGES.md`).

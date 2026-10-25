# Performance

## How Valiq validates

The first time a schema is used, Valiq compiles it into a tree of specialised closures and caches
the result on the schema. It does not generate source code (`eval` / `new Function`), so it works
under a Content Security Policy without `unsafe-eval`. The design choices that matter for speed:

- **Zero-copy success path.** For schemas without transforms or defaults, `safeParse` runs an
  allocation-free check and returns the input itself. Error details are only computed when
  validation fails.
- **Copy on write.** When something does change (a default, a trim), only the objects and arrays
  on the path to the change are copied.
- **Cheap failure reporting.** Paths are built while unwinding after a failure, not tracked on the
  success path. `safeParse` errors skip stack-trace capture, which would otherwise dominate the
  cost of invalid input.
- **Discriminated unions** are detected automatically and dispatched with a map lookup.
- **Fast rejection of oversized input.** Arrays above `max()`/`maxItems` are rejected without
  visiting their items, and strings above `max()`/`maxLength` skip their remaining checks
  (patterns, formats).

## Benchmarks

`npm run benchmark` builds the package and runs [`benchmarks/run.mjs`](../benchmarks/run.mjs).
Each task runs for 1 second after a warm-up ([tinybench](https://github.com/tinylibs/tinybench));
`--time=<ms>` changes the duration and `--json` prints machine-readable output. Before timing, the
script checks that every library accepts the valid inputs and rejects the invalid one.

### Workloads

The schemas live in [`benchmarks/workloads.mjs`](../benchmarks/workloads.mjs) and express the same
rules in every library:

- **user**: an object with a non-empty string, an integer in 0–150, a boolean, an array of at most
  10 strings, and a nested object with a string and a 5-digit pattern.
- **invalid user**: five of those rules broken.
- **users**: an array of 1,000 valid users.
- **events**: 300 items of a three-member union discriminated by `type` (Zod
  `discriminatedUnion`, Valibot `variant`, Valiq's automatic detection, Ajv `oneOf`).
- **cold start**: create the schema (or compile it, for Ajv) and validate one value.

Objects accept unknown keys in every library (Zod `looseObject`, Valibot `looseObject`), so none
of them copies its input. Error-collecting runs use Ajv `allErrors: true`; Zod and Valibot collect
all issues by default.

### Results

Node.js 22.23.1, macOS on an Apple M4, valiq 0.1.0, ajv 8.20.0, zod 4.6.7, valibot 1.5.0.
Raw output: [`benchmarks/results/2026-10-25-node22-apple-m4.json`](../benchmarks/results/2026-10-25-node22-apple-m4.json).

| Workload (operations per second)                                  |                  Valiq | Valiq JSON Schema |     Ajv |           Zod | Valibot |
| ----------------------------------------------------------------- | ---------------------: | ----------------: | ------: | ------------: | ------: |
| valid user (`safeParse`; Ajv `validate`)                          |                 7.11 M |     4.10 M (`is`) | 23.30 M |        3.53 M |  2.63 M |
| valid user (`is`)                                                 |                 7.02 M |                   |         |               |         |
| invalid user, all errors                                          |                0.998 M |           0.823 M | 16.60 M |        1.42 M |  1.58 M |
| invalid user, stop at first error (`abortEarly`; Valiq also `is`) | 2.45 M / 23.9 M (`is`) |                 — |  25.7 M | — (no option) |  10.9 M |
| 1,000 valid users                                                 |                  7,832 |             4,396 |  38,307 |         3,576 |   2,723 |
| 300 union items                                                   |                 68,286 |            27,308 | 114,957 |        75,153 |  16,970 |
| cold start                                                        |                519,773 |            42,253 |     422 |        17,035 | 898,515 |

### Reading the results

- **Ajv is the fastest at validating**: about 3× Valiq on valid data and 15× on invalid data
  with all errors collected. It generates and evaluates JavaScript for each schema. If raw
  throughput on a hot path is your main constraint, use Ajv.
- **Valiq is the fastest of the non-code-generating libraries** in these workloads on valid data:
  about 2× Zod and 2.7× Valibot. Zod 4 uses code generation when `new Function` is allowed, as it is
  here.
- **On invalid data with all errors collected, Zod and Valibot are faster** (0.7 µs and 0.6 µs
  against 1.0 µs). Valiq builds complete issues with messages and paths.
- **Cold start** is where the approaches differ most: Ajv spends about 2.3 ms compiling this
  schema; Valiq takes about 2 µs to define and first-run it. For serverless functions or CLIs
  that validate a few documents per process, startup dominates.
- Valiq's JSON Schema validator is about 40% slower than its builder schemas because it follows
  JSON Schema's rules (type-dependent keywords, `oneOf` must try every member).

A second full run on the same machine stayed within ±10% of these numbers. Zod and Valiq swapped
places on the discriminated union (71k vs 74k ops/s), so treat that row as a tie.

These are microbenchmarks on one machine. Results depend on the runtime, CPU, schema shape and
data. Run the suite on your own hardware and workloads before drawing conclusions.

## Tips

- Define schemas once, at module level. Creating a schema is cheap, but compilation happens on
  first use and is cached per schema object.
- Use `is()` when you only need a yes/no answer.
- Use `abortEarly: true` when you only show or log the first problem.
- Prefer discriminated unions (a shared literal `type` field) over unions of arbitrary shapes.
- Keep `.strip()` for request bodies: it copies the object only when unknown keys exist.

## Bundle size

`npm run size` bundles typical imports with rolldown (minified, gzip level 9).
`npm run size -- --compare` adds the same measurement for other libraries.

| Import                                   |      min | min+gzip |
| ---------------------------------------- | -------: | -------: |
| Valiq: `v.string()` only                 |  19.2 KB |   6.9 KB |
| Valiq: object with string, number, array |  28.3 KB |   9.4 KB |
| Valiq: everything in `valiq-js`          |  36.0 KB |  11.5 KB |
| Valiq: `fromJSONSchema`                  |  38.6 KB |  12.8 KB |
| Valiq: both entry points                 |  56.8 KB |  17.5 KB |
| Zod 4: same object                       |  73.6 KB |  20.7 KB |
| `zod/mini`: same object                  |  16.9 KB |   5.5 KB |
| Valibot: same object                     |   4.5 KB |   1.5 KB |
| Ajv: `new Ajv().compile()` (no formats)  | 118.1 KB |  34.6 KB |

Valibot's modular, function-based API is much smaller. Valiq's schema methods live on classes, so
a used schema type brings all of its methods.

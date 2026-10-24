// Reproducible benchmarks. Requires a build: `npm run build && npm run benchmark`.
// Options: --time=<ms per task> (default 1000), --json (machine-readable output).
import { readFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import * as valibot from 'valibot';
import * as w from './workloads.mjs';

const version = (name) =>
  JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const time = Number(arg('time', 1000));
const asJSON = process.argv.includes('--json');

const valiq = w.makeValiq();
const valiqJSON = w.makeValiqJSON();
const ajvFirst = w.makeAjv(false);
const ajvAll = w.makeAjv(true);
const zod = w.makeZod();
const vb = w.makeValibot();

// Sanity: every implementation must agree before anything is timed.
const agree = (name, actual, expected) => {
  if (actual !== expected) throw new Error(`${name} disagrees: got ${actual}, expected ${expected}`);
};
for (const [data, ok] of [
  [w.validUser, true],
  [w.invalidUser, false],
]) {
  agree('valiq', valiq.user.safeParse(data).success, ok);
  agree('valiq json', valiqJSON.user.is(data), ok);
  agree('ajv', ajvAll.user(data), ok);
  agree('zod', zod.user.safeParse(data).success, ok);
  agree('valibot', valibot.safeParse(vb.user, data).success, ok);
}
for (const [schemas, run] of [
  [valiq, (s, d) => s.safeParse(d).success],
  [zod, (s, d) => s.safeParse(d).success],
  [vb, (s, d) => valibot.safeParse(s, d).success],
]) {
  agree('users', run(schemas.users, w.users), true);
  agree('events', run(schemas.events, w.events), true);
}
agree('ajv users', ajvAll.users(w.users) && ajvAll.events(w.events), true);
agree('valiq json users', valiqJSON.users.is(w.users) && valiqJSON.events.is(w.events), true);

const suites = {
  'valid object (5 fields, nested)': {
    'valiq safeParse': () => valiq.user.safeParse(w.validUser),
    'valiq is': () => valiq.user.is(w.validUser),
    'valiq fromJSONSchema is': () => valiqJSON.user.is(w.validUser),
    ajv: () => ajvFirst.user(w.validUser),
    'zod safeParse': () => zod.user.safeParse(w.validUser),
    'valibot safeParse': () => valibot.safeParse(vb.user, w.validUser),
  },
  'invalid object, all errors collected': {
    'valiq safeParse': () => valiq.user.safeParse(w.invalidUser),
    'valiq fromJSONSchema safeParse': () => valiqJSON.user.safeParse(w.invalidUser),
    'ajv (allErrors)': () => ajvAll.user(w.invalidUser),
    'zod safeParse': () => zod.user.safeParse(w.invalidUser),
    'valibot safeParse': () => valibot.safeParse(vb.user, w.invalidUser),
  },
  'invalid object, first error only': {
    'valiq safeParse abortEarly': () => valiq.user.safeParse(w.invalidUser, { abortEarly: true }),
    'valiq is': () => valiq.user.is(w.invalidUser),
    ajv: () => ajvFirst.user(w.invalidUser),
    'valibot abortEarly': () => valibot.safeParse(vb.user, w.invalidUser, { abortEarly: true }),
  },
  'valid array of 1,000 objects': {
    'valiq safeParse': () => valiq.users.safeParse(w.users),
    'valiq fromJSONSchema is': () => valiqJSON.users.is(w.users),
    ajv: () => ajvFirst.users(w.users),
    'zod safeParse': () => zod.users.safeParse(w.users),
    'valibot safeParse': () => valibot.safeParse(vb.users, w.users),
  },
  'discriminated union, 300 items': {
    'valiq safeParse': () => valiq.events.safeParse(w.events),
    'valiq fromJSONSchema is (oneOf)': () => valiqJSON.events.is(w.events),
    'ajv (oneOf)': () => ajvFirst.events(w.events),
    'zod discriminatedUnion': () => zod.events.safeParse(w.events),
    'valibot variant': () => valibot.safeParse(vb.events, w.events),
  },
  'cold start: define + first validation': {
    valiq: () => w.makeValiq().user.safeParse(w.validUser),
    'valiq fromJSONSchema': () => w.makeValiqJSON().user.is(w.validUser),
    'ajv compile': () => w.makeAjv(false).user(w.validUser),
    zod: () => w.makeZod().user.safeParse(w.validUser),
    valibot: () => valibot.safeParse(w.makeValibot().user, w.validUser),
  },
};

const report = {
  runtime: `Node.js ${process.version} (${process.platform} ${process.arch})`,
  versions: {
    valiq: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
    ajv: version('ajv'),
    zod: version('zod'),
    valibot: version('valibot'),
  },
  results: {},
};

for (const [suite, tasks] of Object.entries(suites)) {
  const bench = new Bench({ time, warmup: true, warmupTime: 100 });
  for (const [name, fn] of Object.entries(tasks)) bench.add(name, fn);
  await bench.run();
  const rows = bench.tasks.map((task) => {
    const r = task.result;
    return {
      task: task.name,
      'ops/s': Math.round(r.throughput.mean),
      'p50 (µs)': +(r.latency.p50 * 1000).toFixed(2),
      'p99 (µs)': +(r.latency.p99 * 1000).toFixed(2),
      '±%': +r.latency.rme.toFixed(2),
      samples: r.latency.samplesCount,
    };
  });
  rows.sort((a, b) => b['ops/s'] - a['ops/s']);
  report.results[suite] = rows;
}

if (asJSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(report.runtime);
  console.log(
    Object.entries(report.versions)
      .map(([k, ver]) => `${k}@${ver}`)
      .join('  '),
  );
  for (const [suite, rows] of Object.entries(report.results)) {
    console.log(`\n## ${suite}`);
    console.table(rows);
  }
}

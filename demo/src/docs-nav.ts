/**
 * The documentation sidebar. Each slug is a file in ../../docs (docs/<slug>.md); the pages are
 * rendered from those files at build time by content-plugin.ts, so README links and the site
 * never drift apart.
 */
export type DocLink = { slug: string; title: string; blurb: string };
export type DocGroup = { title: string; items: DocLink[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    title: 'Introduction',
    items: [
      { slug: 'getting-started', title: 'Getting Started', blurb: 'Install valiq-js and write your first schema.' },
      { slug: 'concepts', title: 'Core Concepts', blurb: 'parse vs safeParse vs is, input and output, immutability.' },
    ],
  },
  {
    title: 'Guide',
    items: [
      { slug: 'schemas', title: 'Schemas', blurb: 'Every schema type, method and format rule.' },
      { slug: 'typescript', title: 'TypeScript', blurb: 'Inference, input and output types, brands and recursion.' },
      { slug: 'errors', title: 'Errors', blurb: 'Issue codes, paths, formatting and localised messages.' },
      { slug: 'custom-validation', title: 'Custom Validation', blurb: 'refine, transform, pipe and custom schemas.' },
      { slug: 'json-schema', title: 'JSON Schema', blurb: 'fromJSONSchema, toJSONSchema, drafts and conformance.' },
      { slug: 'examples', title: 'Examples', blurb: 'API requests, forms, environment config and more.' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { slug: 'api', title: 'API Reference', blurb: 'Every export, method and option.' },
      {
        slug: 'performance',
        title: 'Performance',
        blurb: 'Benchmarks against Ajv, Zod and Valibot, and how to read them.',
      },
      { slug: 'security', title: 'Security', blurb: 'Prototype pollution, ReDoS, resource limits and CSP.' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { slug: 'migration', title: 'Migrating from Zod or Ajv', blurb: 'Side-by-side equivalents for both libraries.' },
      {
        slug: 'troubleshooting',
        title: 'Troubleshooting & FAQ',
        blurb: 'Common questions and how to fix common errors.',
      },
      { slug: 'roadmap', title: 'Status & Roadmap', blurb: 'What is supported today and what comes next.' },
    ],
  },
];

export const DOC_PAGES: DocLink[] = DOC_GROUPS.flatMap((g) => g.items);
export const DEFAULT_DOC = 'getting-started';

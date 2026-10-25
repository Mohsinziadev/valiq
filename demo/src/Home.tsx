import { useState, type CSSProperties, type ReactNode } from 'react';
import { DOC_GROUPS } from './docs-nav';
import { ArrowRight, CheckIcon, CopyIcon, GitHubIcon, Logo } from './icons';
import {
  CHANGELOG_URL,
  installCommand,
  M2TOOLKIT,
  NPM_URL,
  PACKAGE_MANAGERS,
  PACKAGES_URL,
  PKG,
  RELATED,
  REPO,
  type PackageManager,
} from './meta';
import { Playground } from './Playground';
import { docHref } from './router';
import { fieldRows, userResult } from './samples';
import { Snippet } from './Snippet';

function Install() {
  const [pm, setPm] = useState<PackageManager>('npm');
  const [copied, setCopied] = useState(false);
  const command = installCommand(pm);
  return (
    <div className="install">
      <div className="install-tabs" role="tablist" aria-label="Package manager">
        {PACKAGE_MANAGERS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === pm} onClick={() => setPm(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="install-cmd">
        <span className="install-prompt" aria-hidden="true">
          $
        </span>
        <code>{command}</code>
        <button
          type="button"
          className="install-copy"
          aria-label={copied ? 'Copied' : `Copy "${command}"`}
          onClick={() =>
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            })
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

/** A terminal printing what Valiq really returns for the sample user (computed at build time). */
function Terminal() {
  const rows = fieldRows();
  const failed = rows.filter((r) => !r.ok);
  const issues = userResult.success ? [] : userResult.error.issues;
  return (
    <div
      className="terminal"
      role="img"
      aria-label="Terminal output of validating a user object with Valiq: three fields pass, two fail with too_small and invalid_format issues."
    >
      <div className="terminal-bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <em>validate-user.ts</em>
      </div>
      <pre className="terminal-body" aria-hidden="true">
        <span className="t-dim">$ </span>node --run validate{'\n\n'}
        {rows.map((r) => (
          <span key={r.key} className="t-row">
            <span className={r.ok ? 't-pass' : 't-fail'}>{r.ok ? '✓' : '✗'}</span>{' '}
            <span className="t-badge">{r.kind.padEnd(6)}</span> <span className="t-key">{r.key.padEnd(8)}</span>{' '}
            {r.ok ? <span className="t-val">{r.detail}</span> : <span className="t-err">{r.issue?.code}</span>}
            {!r.ok && <span className="t-dim"> {r.detail}</span>}
            {'\n'}
          </span>
        ))}
        {'\n'}
        <span className="t-dim"> Fields </span>
        <span className="t-pass">{rows.length - failed.length} passed</span>{' '}
        <span className="t-fail">{failed.length} failed</span> <span className="t-dim">({rows.length})</span>
        {'\n'}
        <span className="t-dim"> Issues </span>
        {issues.map((i) => i.code).join(', ')}
        {'\n'}
        <span className="t-dim"> Leaked </span>0 submitted values in messages{'\n\n'}
        <span className="t-fail-badge">FAIL</span>{' '}
        <span className="t-err">
          safeParse → {'{'} success: false {'}'}
        </span>
      </pre>
    </div>
  );
}

const FEATURES: { title: string; body: ReactNode; visual: ReactNode; art?: boolean }[] = [
  {
    title: 'Errors you can act on',
    body: (
      <>
        Every issue has a stable <code>code</code>, the exact <code>path</code>, a readable message and the constraint
        that failed. Messages never contain the submitted value, so issues are safe to log or return in an API response.
      </>
    ),
    visual: <Snippet name="errors" />,
  },
  {
    title: 'Strong type inference',
    body: (
      <>
        Optional keys, defaults (input and output types differ), unions, tuples, records, brands and transforms are all
        inferred with <code>Infer</code> and <code>Input</code>.
      </>
    ),
    visual: <Snippet name="inference" />,
  },
  {
    title: 'JSON Schema, both ways',
    body: (
      <>
        Compile JSON Schema 2020-12, 2019-09 and draft-07 with <code>fromJSONSchema</code>, export with{' '}
        <code>toJSONSchema</code>. A typo like <code>maxLenght</code> throws at startup instead of silently accepting
        everything.
      </>
    ),
    visual: <Snippet name="json-schema" className="snippet-floating" />,
    art: true,
  },
  {
    title: 'Works with your stack',
    body: (
      <>
        Implements <a href="https://standardschema.dev">Standard Schema</a>, so tRPC, TanStack Form, React Hook
        Form&apos;s Standard Schema resolver and Hono&apos;s standard validator accept Valiq schemas directly.
      </>
    ),
    visual: (
      <>
        <Snippet name="standard" />
        <ul className="chips" aria-label="Libraries that accept Standard Schema">
          {['tRPC', 'TanStack Form', 'React Hook Form', 'Hono'].map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </>
    ),
  },
  {
    title: 'Safe by default',
    body: (
      <>
        Resistant to prototype pollution and ReDoS in built-in formats, with resource limits for recursion depth, issue
        count and oversized arrays. No <code>eval</code> or <code>new Function</code>, so it works under a strict
        Content Security Policy.
      </>
    ),
    visual: (
      <ul className="checklist">
        {[
          ['Own properties only', 'inherited values are treated as missing'],
          ['Input is never mutated', 'defaults are cloned for each use'],
          ['Linear-time formats', 'email, url, uuid, ip, dates'],
          ['Resource limits', 'maxDepth 512 · maxIssues 100'],
          ['CSP-safe', 'no code generation'],
        ].map(([title, note]) => (
          <li key={title}>
            <CheckIcon />
            <span>
              <strong>{title}</strong> {note}
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: 'Validation, not hidden transformation',
    body: (
      <>
        Valid input is returned as the same object. Nothing is coerced, copied or stripped unless you ask for it with{' '}
        <code>v.coerce.*</code>, <code>.default()</code>, <code>.strip()</code> or <code>.transform()</code>.
      </>
    ),
    visual: (
      <div className="mini-terminal" aria-hidden="true">
        <span className="t-dim">&gt;</span> const input = {'{'} name: &apos;Ada&apos;, age: 36 {'}'}
        {'\n'}
        <span className="t-dim">&gt;</span> User.parse(input) === input{'\n'}
        <span className="t-pass">true</span> <span className="t-dim">// no copy, no coercion</span>
        {'\n'}
        <span className="t-dim">&gt;</span> User.strip().parse({'{'} ...input, role: &apos;admin&apos; {'}'}){'\n'}
        {'{'} name: &apos;Ada&apos;, age: 36 {'}'} <span className="t-dim">// only when you ask</span>
      </div>
    ),
  },
];

const STATS = [
  { value: '0', label: 'Zero dependencies' },
  { value: '9.5 kB', label: 'min+gzip for an object schema' },
  { value: '3,009', label: 'official JSON Schema suite tests passed' },
  { value: 'ESM + CJS', label: 'Node.js 18+ and modern browsers' },
];

export function Home() {
  return (
    <main id="main" tabIndex={-1} className="home-view">
      <div className="frame">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              by <a href={PACKAGES_URL}>M2Toolkit</a> <span className="eyebrow-sep">·</span> v{PKG.version}
            </p>
            <h1 className="hero-title">
              Modern validation.
              <br />
              Precise errors.
            </h1>
            <p className="hero-tagline">
              TypeScript-first schema validation with JSON Schema support. Type-safe by design.
            </p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref('getting-started')}>
                Get Started
              </a>
              <a className="btn" href={REPO} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
            <Install />
          </div>
          <div className="hero-art art">
            <Terminal />
          </div>
        </section>

        <section className="why" aria-labelledby="why-title">
          <div>
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Why Valiq
            </p>
            <h2 id="why-title" className="section-title">
              One schema.
              <br />
              Types, validation and errors.
            </h2>
            <a className="btn" href={docHref('concepts')}>
              Learn more
            </a>
          </div>
          <div className="why-copy">
            <p>
              Describe your data once and get a runtime validator, an inferred TypeScript type, structured errors that
              are safe to send to clients or write to logs, and JSON Schema in both directions.
            </p>
            <p>
              Build schemas in TypeScript, or compile existing JSON Schema documents. Both produce the same kind of
              schema with the same API, and they nest inside each other. Framework-agnostic: no dependencies, no Node.js
              built-ins, and the same code runs in Node.js and the browser.
            </p>
            <Snippet name="hero" />
          </div>
        </section>

        <section className="statement">
          <h2 className="statement-title">Precise. Typed. Dependency-free.</h2>
        </section>

        <section className="features" id="features" aria-label="Features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className={f.art ? 'feature-visual art' : 'feature-visual'}>{f.visual}</div>
            </article>
          ))}
        </section>
        <div className="features-more">
          <a className="btn" href={docHref('schemas')}>
            See every schema and check
          </a>
        </div>

        <Playground />

        <section className="stats" aria-label="Valiq in numbers">
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </section>

        <section className="docs-index" id="documentation" aria-labelledby="docs-index-title">
          <div className="section-head">
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Documentation
            </p>
            <h2 id="docs-index-title" className="section-title">
              Everything, from your first schema to JSON Schema conformance.
            </h2>
          </div>
          <div className="docs-index-groups">
            {DOC_GROUPS.map((g) => (
              <div key={g.title} className="docs-index-group">
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((d) => (
                    <li key={d.slug}>
                      <a href={docHref(d.slug)}>
                        <span className="docs-index-title">
                          {d.title} <ArrowRight width={14} height={14} />
                        </span>
                        <span className="docs-index-blurb">{d.blurb}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="related" aria-labelledby="related-title">
          <div className="section-head">
            <p className="eyebrow">m2toolkit</p>
            <h2 id="related-title" className="section-title">
              More open-source packages from M2Toolkit.
            </h2>
          </div>
          <ul className="related-list">
            {RELATED.map((p) => (
              <li key={p.slug}>
                <a href={p.url} style={{ '--accent': p.accent } as CSSProperties}>
                  <span className="related-dot" aria-hidden="true" />
                  <span className="related-title">{p.title}</span>
                  <span className="related-tag">{p.tagline}</span>
                  <span className="related-go">
                    /npm-packages/{p.slug} <ArrowRight width={14} height={14} />
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a href={PACKAGES_URL} className="related-all">
                <span className="related-title">All npm packages</span>
                <span className="related-tag">Every package we publish, with live previews.</span>
                <span className="related-go">
                  browse all <ArrowRight width={14} height={14} />
                </span>
              </a>
            </li>
          </ul>
        </section>

        <section className="cta art">
          <div className="cta-card">
            <h2>Start validating with Valiq</h2>
            <p>Describe your data once. Get types, validation and errors you can act on.</p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref('getting-started')}>
                Get Started
              </a>
              <a className="btn" href="#playground">
                Open the playground
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>{PKG.description}</p>
          </div>
          <div>
            <h3>Docs</h3>
            <a href={docHref('getting-started')}>Getting Started</a>
            <a href={docHref('schemas')}>Schemas</a>
            <a href={docHref('errors')}>Errors</a>
            <a href={docHref('json-schema')}>JSON Schema</a>
            <a href={docHref('api')}>API Reference</a>
          </div>
          <div>
            <h3>Resources</h3>
            <a href={REPO} target="_blank" rel="noreferrer">
              <GitHubIcon width={14} height={14} /> GitHub
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              npm
            </a>
            <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
              Security policy
            </a>
          </div>
          <div>
            <h3>M2Toolkit</h3>
            <a href={M2TOOLKIT}>Home</a>
            <a href={`${M2TOOLKIT}/tools`}>Free tools</a>
            <a href={PACKAGES_URL}>npm packages</a>
            <a href={`${M2TOOLKIT}/about`}>About</a>
          </div>
        </div>
        <p className="footer-bottom">
          Released under the {PKG.license} License. © 2026 Mohsin Zia. Hosted on{' '}
          <a href={PACKAGES_URL}>m2toolkit.com/npm-packages</a>.
        </p>
      </footer>
    </main>
  );
}

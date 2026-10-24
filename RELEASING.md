# Releasing

Publishing requires npm credentials for the `valiq` package. Never commit tokens.

## Checklist

1. Confirm the package name is still available: `npm view valiq` should report 404 (the name was
   unpublished by a previous owner in 2022; npm allows reuse, but check before the first publish).
2. Add `repository`, `homepage` and `bugs` to `package.json` once the public repository exists, so
   that README links work on npmjs.com.
3. Update `version` in `package.json` and move the "Unreleased" section in `CHANGELOG.md` under the
   new version with today's date.
4. Run `npm ci && npm run verify` (lint, formatting, type checks, type tests, tests, docs code
   blocks, build, publint, arethetypeswrong, size budget, packed-tarball smoke test, examples).
5. Inspect the tarball: `npm pack --dry-run`. Expect only `dist/`, `README.md`, `CHANGELOG.md`,
   `LICENSE`, `SECURITY.md` and `package.json`.
6. Optionally re-run `npm run benchmark` and update `docs/performance.md` and the README if the
   numbers changed materially.

## Publish

```sh
npm login
npm publish --access public          # add --provenance when publishing from CI with OIDC
git tag v0.1.0 && git push --tags
```

For a pre-release, use a version such as `0.2.0-beta.0` and `npm publish --tag next`.

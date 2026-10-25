# Releasing

Publishing requires npm credentials for the `valiq-js` package (npm rejects the name `valiq` as too
similar to existing packages, so the library is published as `valiq-js`). Never commit tokens.

## Checklist

1. Check what is already released: `npm view valiq-js versions`.
2. Update `version` in `package.json` and move the "Unreleased" section in `CHANGELOG.md` under the
   new version with today's date.
3. Run `npm ci && npm run verify` (lint, formatting, type checks, type tests, tests, docs code
   blocks, build, publint, arethetypeswrong, size budget, packed-tarball smoke test, examples).
4. Inspect the tarball: `npm pack --dry-run`. Expect only `dist/`, `README.md`, `CHANGELOG.md`,
   `LICENSE`, `SECURITY.md` and `package.json`.
5. Optionally re-run `npm run benchmark` and update `docs/performance.md` and the README if the
   numbers changed materially.

## Publish

```sh
npm login
npm publish --access public          # add --otp=<code> with 2FA; --provenance from CI with OIDC
git tag v0.1.0 && git push --tags
```

For a pre-release, use a version such as `0.2.0-beta.0` and `npm publish --tag next`.

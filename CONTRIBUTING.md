# Contributing

This is a pnpm monorepo of independent `@opennsw/*` packages. See the [README](README.md) for setup and common commands, and for the [release steps](README.md#releasing).

## Releasing a package

Packages reach npm with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no token secret) and build provenance, through [staged publishing](https://docs.npmjs.com/staged-publishing/): CI can only _stage_ a version, and a maintainer approves it on npm with 2FA before it is installable. When a release tag is pushed, [`release.yml`](.github/workflows/release.yml) builds the package and stages it.

### Approving a staged release

The `release.yml` run ends with a job summary that has the stage ID and these commands. You need publish access to the package and 2FA on your npm account.

```sh
npm stage list @opennsw/<name>          # find the stage ID
npm stage download <stage-id>           # optional: inspect the tarball
npm stage approve <stage-id>            # asks for 2FA; the version goes live
npm stage reject <stage-id>             # discard it instead
```

Or use the **Staged Packages** tab of the package on npmjs.com. Look at the tarball before approving: it should contain `dist`, `README.md` and `package.json`, and the code should match the tag. Prefer an approver other than whoever pushed the tag; npm doesn't enforce that. Check afterwards that the approved version carries its provenance badge.

Don't re-run a release while its version is still staged: a re-run would stage it again. Reject the old stage first.

### npm settings for a package

Set these on npmjs.com, in the package's settings, before its first staged release:

- **Trusted Publisher:** GitHub Actions, repository `OpenNSW/ui-packages`, workflow `release.yml`, with **Allowed actions** set to `npm stage publish` only (not `npm publish`), so CI can stage a version but never make it live. `release.yml` can't stage the package until this is done.
- **Publishing access:** require two-factor authentication and disallow tokens, so nothing else can publish.

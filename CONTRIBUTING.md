# Contributing

This is a pnpm monorepo of independent `@opennsw/*` packages. See the [README](README.md) for setup and common commands.

## Pull requests

### Title

`main` takes squash merges only, and the squash commit's subject is the PR title. The **Conventional Commit Title** check ([`pr-title.yml`](.github/workflows/pr-title.yml)) requires a [Conventional Commit](https://www.conventionalcommits.org/) title:

```
type(scope): description
```

- **type:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` or `revert`.
- **scope:** optional and free-form: a package (`jsonforms-renderers`, `auth`) or a feature area (`xml-export`).
- **`!` before the colon** marks a breaking change: `feat(xml-export)!: write dates in the configured format`.

### Labels

Every PR needs two kinds of label so that it lands in the right package's release notes. [`pr-labels.yml`](.github/workflows/pr-labels.yml) adds what it can and fails the **Release notes label** check until the rest is there.

| Label              | Meaning                                                                                                            | Set by                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `Package/<dir>`    | The PR belongs to `packages/<dir>`. One per package the PR changes.                                                | Automatic, from the changed files                                 |
| `Type/New Feature` | Release notes: **New Features**                                                                                    | Automatic for `feat`                                              |
| `Type/Bug`         | Release notes: **Bug Fixes**                                                                                       | Automatic for `fix`                                               |
| `Type/Improvement` | Release notes: **Improvements**                                                                                    | A person                                                          |
| `Type/Task`        | Release notes: **Other Changes**                                                                                   | A person                                                          |
| `breaking change`  | Release notes: **Breaking Changes**. Add it next to another label whenever consumers must change code.             | Automatic for `!`                                                 |
| `skip-changelog`   | Left out of the notes: tests, CI, refactors, anything a consumer won't notice. Not allowed with `breaking change`. | Automatic for bots and `chore(release)` bumps; otherwise a person |

A PR that changes nothing under `packages/` has no `Package/<dir>` label, so it needs `skip-changelog`, or the `Package/<dir>` label of the package it affects added by hand.

The checks are advisory until a repository admin makes them required in the branch ruleset.

### Release notes section

The PR template has a **Release notes** section. Write it for the people who install the package: for a breaking change, what they have to change (`x-xml.writeTo` now needs a leading slash: rename `a/b` to `/a/b`); for a feature or fix, one sentence. The release skill reads it when it drafts the notes. Write `N/A` for changes nobody outside the repo would notice, and label them `skip-changelog`.

## Releasing a package

Each package is versioned and released on its own, with a tag `<package-dir>-v<version>` (for example `jsonforms-renderers-v0.11.0`). Packages reach npm with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no token secret) and build provenance, through [staged publishing](https://docs.npmjs.com/staged-publishing/): CI can only _stage_ a version, and a maintainer approves it on npm with 2FA before it is installable.

1. **Bump.** Actions → **Release - Bump package version** → _Run workflow_, with the package directory (`jsonforms-renderers`) and the new version (`0.12.0`, no `v`). It opens `chore(release): bump @opennsw/<pkg> to v<version>`. While a package is on 0.x, a breaking change or a new feature bumps the minor version and fixes alone bump the patch.
2. **Merge** the bump PR once it is approved. CI doesn't start automatically on a PR opened by the workflow's token; re-run it from the Actions tab if you want it.
3. **Release.** In Claude Code, from this repo, run the **`release-package`** skill for the package (`/release-package jsonforms-renderers`). It finds the package's previous release, collects only the PRs that belong to the package (labelled `Package/<dir>` or changing files under `packages/<dir>/`), drafts the notes, and after you confirm them creates a **draft** GitHub Release pinned to the bump commit. It never publishes anything.
4. **Publish.** Read the draft on GitHub, edit it if needed, and press **Publish**. That creates the tag, which starts [`release.yml`](.github/workflows/release.yml): it checks the tag matches `package.json` and is on `main`, builds, and **stages** the package on npm. Pre-release versions (`1.2.0-beta.1`) stage under the `next` dist-tag. A version that is already on npm is skipped, so re-running an approved release is safe.
5. **Approve on npm.** A maintainer approves the staged package (see below). Only then is the version live.

Before step 3, make sure PRs in the release carry the right labels. The skill lists any that are missing or look wrong.

### Approving a staged release

The `release.yml` run ends with a job summary that has the stage ID and these commands. You need publish access to the package and 2FA on your npm account.

```sh
npm stage list @opennsw/<name>          # find the stage ID
npm stage download <stage-id>           # optional: inspect the tarball
npm stage approve <stage-id>            # asks for 2FA; the version goes live
npm stage reject <stage-id>             # discard it instead
```

Or use the **Staged Packages** tab of the package on npmjs.com. Look at the tarball before approving: it should contain `dist`, `README.md` and `package.json`, and the code should match the tag. Prefer an approver other than whoever published the GitHub release; npm doesn't enforce that. Check afterwards that the approved version carries its provenance badge.

Don't re-run a release while its version is still staged: a re-run would stage it again. Reject the old stage first.

### npm settings for a package

Set these on npmjs.com, in the package's settings, before its first staged release:

- **Trusted Publisher:** GitHub Actions, repository `OpenNSW/ui-packages`, workflow `release.yml`, with **Allowed actions** set to `npm stage publish` only (not `npm publish`), so CI can stage a version but never make it live. `release.yml` can't stage the package until this is done.
- **Publishing access:** require two-factor authentication and disallow tokens, so nothing else can publish.

### Adding a package

1. Create `packages/<name>/`; the `packages/*` workspace glob picks it up.
2. Name it `@opennsw/<name>`, set `"version"`, and add `publishConfig: { "access": "public" }` and a `repository` entry with `"directory": "packages/<name>"` (provenance fails if the repository URL doesn't match this repo).
3. Define **`build`** and **`type-check`** scripts: CI runs them with `pnpm --recursive`, which silently skips a package without them.
4. Configure the package on npmjs.com as described in [npm settings for a package](#npm-settings-for-a-package). `release.yml` can't stage the package until this is done.
5. Publish the first version, then tag that commit (`<name>-v<version>`) so the next release's notes have a starting point. Without an earlier tag the release skill asks which commit to start from.
6. Keep the package's `README.md` short, since it is what npm shows: what it is, how to install and use it, and absolute links to the details in this repo. `docs/` is not part of the published tarball.
7. Copy the root [`LICENSE`](LICENSE) into the package directory and set `"license": "Apache-2.0"` in its `package.json`. npm ships a `LICENSE` file from the package root even when `files` doesn't list it, and a tarball without one has no licence text.

# OpenNSW UI Packages

A pnpm monorepo of the shared UI packages that make up the **OpenNSW Framework** — reusable React components and renderers styled with [Radix UI Themes](https://www.radix-ui.com/themes), published under the [`@opennsw`](https://www.npmjs.com/org/opennsw) npm scope.

## Packages

| Package                                                        | Description                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`@opennsw/jsonforms-renderers`](packages/jsonforms-renderers) | [JSON Forms](https://jsonforms.io/) controls and layout renderers for React, styled to match the OpenNSW portal applications. |
| [`@opennsw/auth`](packages/auth)                               | Shared OIDC setup for the portals: `UserManager` defaults, IdP config parsing, role mapping and bearer headers.               |

## Repository layout

```
.
├── packages/                 # publishable @opennsw/* packages (one dir each)
│   ├── auth/
│   └── jsonforms-renderers/
├── eslint.config.js          # shared, repo-wide ESLint flat config
├── .prettierrc               # shared Prettier config
├── pnpm-workspace.yaml        # workspace globs (packages/*)
├── .github/workflows/         # CI, PR checks and release automation
├── .claude/skills/            # Claude Code skills (release-package)
└── CONTRIBUTING.md            # PR titles, labels and the release procedure
```

Tooling is centralized at the root so every package shares one lint, format, and TypeScript setup.

## Prerequisites

- **Node.js** `>=22.18.0`
- **pnpm** `>=11` (the repo pins it via `devEngines`; `corepack` or `pnpm`'s own self-install will fetch the right version)

## Getting started

```bash
pnpm install
```

## Common commands

Run from the repo root — each one fans out across the workspace:

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `pnpm build`        | Build every package (`pnpm --recursive run build`).             |
| `pnpm type-check`   | Type-check every package.                                       |
| `pnpm test`         | Run every package's unit tests.                                 |
| `pnpm lint`         | Lint the whole repo with the shared ESLint config (`eslint .`). |
| `pnpm format:check` | Verify Prettier formatting.                                     |
| `pnpm format:fix`   | Apply Prettier formatting.                                      |

To work on a single package, use a filter, e.g.:

```bash
pnpm --filter @opennsw/jsonforms-renderers run dev
```

## Adding a new package

1. Create `packages/<name>/` — it's picked up automatically by the `packages/*` workspace glob.
2. Scope the package name as `@opennsw/<name>` and set `"version"`.
3. Define **`build`** and **`type-check`** scripts in its `package.json`. CI runs these with `pnpm --recursive`, which _silently skips_ packages that lack them — so without these scripts the package builds green but goes unverified.
4. No ESLint or Prettier setup is needed: the root `eslint.config.js` (with `projectService`) and `.prettierrc` cover all `packages/**` automatically.
5. To publish it, follow [Adding a package](CONTRIBUTING.md#adding-a-package): register the npm Trusted Publisher and tag the first release. The shared [`release.yml`](.github/workflows/release.yml) stages every package.

## Continuous integration

[`packages-ci.yml`](.github/workflows/packages-ci.yml) runs on pull requests that touch `packages/**` or the shared root config. It performs type-check → lint → format check → build, then a security stage (dependency review + `pnpm audit`). Lint and the security checks are currently non-blocking (`continue-on-error`); type-check, formatting, and build must pass.

Every PR also gets a **Conventional Commit Title** check ([`pr-title.yml`](.github/workflows/pr-title.yml)) and a **Release notes label** check ([`pr-labels.yml`](.github/workflows/pr-labels.yml)), which labels the PR with its package and change type. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Releasing

Each package is versioned, tagged (`<package-dir>-v<version>`) and released to npm on its own, with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no token secret) and [staged publishing](https://docs.npmjs.com/staged-publishing/): CI stages the version and a maintainer approves it on npm with 2FA. In short:

1. Run **Release - Bump package version** in the Actions tab and merge the PR it opens.
2. Run the `release-package` skill in Claude Code: it drafts the package's release notes from only the PRs that belong to it and creates a draft GitHub Release.
3. Publish the draft on GitHub. That creates the tag, and [`release.yml`](.github/workflows/release.yml) stages the package on npm.
4. A maintainer approves the staged package on npm (2FA). Only then is it live.

The full procedure, the PR labels it relies on, and how to add a package are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)

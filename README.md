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
└── .github/workflows/         # CI + release automation
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
5. For publishing, add a `publishConfig: { "access": "public" }` (scoped packages are private by default) and a release workflow modeled on [`jsonforms-renderers-release.yaml`](.github/workflows/jsonforms-renderers-release.yaml).

## Continuous integration

[`packages-ci.yml`](.github/workflows/packages-ci.yml) runs on pull requests that touch `packages/**` or the shared root config. It performs type-check → lint → format check → build, then a security stage (dependency review + `pnpm audit`). Lint and the security checks are currently non-blocking (`continue-on-error`); type-check, formatting, and build must pass.

## Releasing

Each package is published independently via its own tag-triggered workflow using npm [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no token secret). For `@opennsw/jsonforms-renderers`:

1. Bump `"version"` in `packages/jsonforms-renderers/package.json` and merge to `main`.
2. Tag the commit and push the tag:
   ```bash
   git tag jsonforms-renderers-v0.3.1
   git push origin jsonforms-renderers-v0.3.1
   ```
3. The release workflow verifies the tag matches `package.json`, builds, and publishes to npm with provenance.

## License

[Apache-2.0](LICENSE)

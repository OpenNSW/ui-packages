---
name: release-package
description: Release one @opennsw package from ui-packages — after its version bump PR has merged, draft the package's release notes from only the PRs that belong to it (Package/<dir> label or files under packages/<dir>/) since its previous release, and create a DRAFT GitHub Release pinned to the bump commit for review. Use it whenever someone wants to release, publish or cut a version of a package here, asks for release notes or what changed in a package since its last release, or says the bump PR is merged, even if they don't say "release notes". It only ever creates a draft; it never tags, pushes, publishes or dispatches a workflow.
---

# Release a package

Drafts the GitHub Release for one package. Publishing that release (a person clicks **Publish**) creates the tag `<dir>-v<version>`, and the tag triggers `.github/workflows/release.yml`, which builds and **stages** the package on npm. A maintainer then approves the staged package on npm with 2FA, and only then is it installable. So the draft is the last point where a person can still fix the notes, and the npm approval is the last gate before the code goes live.

The repo holds several packages that release independently, so the notes must carry only what changed **in this package**: another package's PRs, repo-wide chores and the bump PR itself stay out.

## Hard rules

- **Create a draft, nothing more.** Never publish the release, push or create a tag, run `gh workflow run`, or edit files in the repo. Publishing starts the release of the package to npm; that is a person's call, made after reading the draft, and the npm approval is a second, separate one.
- **Pin the release to the bump commit** (`--target <bump_sha>`), never to `main`. PRs merged after the bump must not ship under this tag.
- **Back every statement with evidence** — a PR, its "Release notes" section, or its diff. If a breaking change doesn't say what consumers have to change and the diff doesn't make it obvious, list it as an open question instead of guessing. A wrong migration note does more harm than a missing one.
- **Write for the people who install the package**, not for the maintainers. Use absolute links only; the notes are shown on GitHub and copied nowhere else.
- Scratch files go in your scratchpad directory, never in the repo.

## Steps

### 1. Preflight

```bash
gh auth status
git fetch origin --tags
```

If `gh auth status` fails, tell the user and stop. Work from `origin/main`: a release is cut from it, and a feature branch describes the wrong code.

If the user didn't name the package, list `git ls-tree --name-only origin/main packages/` and ask which one.

### 2. Resolve the release

```bash
.claude/skills/release-package/scripts/resolve.sh --package <dir>
```

It prints `name`, `version`, `tag`, `bump_sha`, `prev_tag` and `prev_sha`, and refuses (exit 1) when the version is already released or a release for it exists, even as a draft. In that case tell the user: the version needs bumping first (Actions → **Release - Bump package version**).

On exit 3 it could not find something and says what to pass:

- No `chore(release): bump … to v<version>` commit on `origin/main` → ask the user which commit to release (it must be on `origin/main`), and pass it as `--bump <sha>`.
- No earlier `<dir>-v*` tag → ask which commit the notes should start after, and pass it as `--from <ref>`.

Show the user what you resolved (package, version, tag, previous tag, bump commit) before going on.

### 3. Collect

```bash
.claude/skills/release-package/scripts/collect.sh --package <dir> --from <prev_sha> --to <bump_sha> > <scratchpad>/release-input.md
```

Read all of it. It lists, in the notes' own format (`* <title> by @author in <url>`), the PRs that belong to the package, grouped as Breaking Changes / New Features / Improvements / Bug Fixes / Other Changes, with the **Release notes** section of each PR beneath it, then New Contributors, then the PRs it **left out** and why.

A PR belongs to the package when it changes a file under `packages/<dir>/` **or** carries the `Package/<dir>` label. It is left out when it is `skip-changelog`, a `chore(release)` bump, opened by a bot, or belongs to another package.

Lines starting with `⚠` need your judgement:

- _no Type/\* label; placed by its title_ — the section is a guess from the title. Check it against the diff (`gh pr diff <n>`), and tell the user the PR is unlabelled.
- _changes packages/\<dir\>/ but has no Package/\<dir\> label_ — included by path; fine, but mention it.
- _has Package/\<dir\> but changes nothing under packages/\<dir\>/_ — someone labelled it by hand, probably because it affects the package indirectly. Keep it only if the PR is something consumers would notice.
- _also changes: \<other package\>_ — the PR spans packages; it appears in both packages' notes. Say in the line what changed for _this_ package if the title doesn't.

Check the **Left out** list too: anything there that a consumer of this package would notice is a labelling mistake to raise with the user (for example, a repo-wide change to `pnpm-workspace.yaml` that alters the build).

### 3b. Understand the breaking changes

For every entry under Breaking Changes, find what consumers must change. Take it from the PR's **Release notes** section; if that is empty, read the PR (`gh pr view <n>`) and its diff. Write one clear sentence, for example: "`x-xml.writeTo` now needs a leading slash: rename `a/b` to `/a/b`." Never invent one: if you can't tell, list it as an open question.

### 4. Write the notes

Match the existing releases (`gh release view <prev_tag> --json body --jq .body`): the same headings, in this order, leaving out empty ones. Start from the collector's lines, drop the `⚠` and `Release notes:` sub-bullets, and put the migration sentence of each breaking change under it:

```markdown
## What's Changed

### Breaking Changes

* feat(scope)!: title by @author in https://github.com/OpenNSW/ui-packages/pull/N
  - What to change: …

### New Features

* …

### Improvements

### Bug Fixes

### New Contributors

* @login made their first contribution in https://github.com/OpenNSW/ui-packages/pull/N

**Full Changelog**: https://github.com/OpenNSW/ui-packages/compare/<prev_tag>...<tag>
```

- Keep the PR's title as the line (it is a Conventional Commit); don't rewrite it into prose.
- `Other Changes` holds `Type/Task` and untyped PRs that a consumer would still notice. Put a PR a consumer wouldn't notice in neither; raise it as a labelling question instead.
- Write the file to `<scratchpad>/release-notes.md`.

### 5. Show, then create the draft

Show the user the notes, then the **open questions**: unlabelled PRs and the section you chose for them, multi-package PRs, breaking changes with no migration note, and anything in "Left out" that looks wrong. Wait for their go-ahead; they may want to fix labels or wording first.

Then:

```bash
gh release create <tag> --repo OpenNSW/ui-packages --draft --target <bump_sha> --title <tag> --notes-file <scratchpad>/release-notes.md
```

The title is the tag name, as for earlier releases. Add `--prerelease` when the version has a `-suffix`.

### 6. Hand off

Give the user the draft's URL and tell them plainly what happens next:

1. Read the draft on GitHub and edit it if needed.
2. **Publish** it. That creates the tag `<tag>` on `<bump_sha>`, which starts `release.yml`; it builds and **stages** `<name>@<version>` on npm. Nothing is installable yet.
3. A maintainer **approves the staged package** on npm with 2FA (the Staged Packages tab on npmjs.com, or `npm stage list <name>` then `npm stage approve <stage-id>`). The job summary of the `release.yml` run has the commands, and `npm stage download <stage-id>` lets them inspect the tarball first.
4. Check it is live once approved: `gh run list --workflow release.yml --limit 1` and `npm view <name>@<version> version` (run outside the repo, because the root `devEngines` makes npm refuse to run inside it).

If it won't be published today, nothing is lost: the draft stays until it is published or deleted.

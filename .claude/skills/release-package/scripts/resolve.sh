#!/usr/bin/env bash
# Works out what a release of one package is, and refuses if it can't be released:
# the version on origin/main, the tag it will get, the bump commit the release
# must be pinned to, and the previous release to diff against. Read-only: it
# fetches nothing (run `git fetch origin --tags` first) and edits nothing.
#
# Usage: resolve.sh --package <dir> [--bump <sha>] [--from <ref>]
#   --bump  use this commit instead of finding the "chore(release): bump" commit
#   --from  use this ref as the previous release instead of the newest tag
#
# Prints key=value lines (package, name, version, tag, bump_sha, prev_tag,
# prev_sha). Exit 1 when the package can't be released, 3 when the bump commit
# or previous release can't be found and the caller has to ask the user.
set -euo pipefail

REPO=OpenNSW/ui-packages
usage() { echo "usage: resolve.sh --package <dir> [--bump <sha>] [--from <ref>]" >&2; exit 2; }
die() { echo "resolve.sh: $*" >&2; exit 1; }

pkg="" bump="" from=""
while [ $# -gt 0 ]; do
  case "$1" in
    --package) pkg="${2:-}"; shift 2 ;;
    --bump) bump="${2:-}"; shift 2 ;;
    --from) from="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$pkg" ] || usage
[[ "$pkg" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "'$pkg' is not a valid package directory name"
for tool in gh jq git; do
  command -v "$tool" > /dev/null || die "needs $tool"
done

main=origin/main
git rev-parse --verify --quiet "${main}^{commit}" > /dev/null || die "no $main; run: git fetch origin --tags"
json=$(git show "${main}:packages/${pkg}/package.json" 2> /dev/null) ||
  die "no packages/${pkg}/package.json on $main. Packages: $(git ls-tree --name-only "$main" packages/ | sed 's|packages/||' | paste -sd' ' -)"
name=$(jq -r .name <<< "$json")
version=$(jq -r .version <<< "$json")
tag="${pkg}-v${version}"

# --- Is this version already released? ---------------------------------------
if git ls-remote --exit-code --tags origin "refs/tags/${tag}" > /dev/null 2>&1; then
  die "tag ${tag} already exists on origin: ${name}@${version} is already released. Bump the version first (Actions: Release - Bump package version)."
fi
# A draft has no tag yet, so look at the release list rather than the tags.
if gh release list --repo "$REPO" --limit 200 --json tagName --jq '.[].tagName' | grep -qx "$tag"; then
  die "a release for ${tag} already exists (possibly a draft). Publish or delete it first."
fi

# --- The commit the release is pinned to --------------------------------------
if [ -z "$bump" ]; then
  # `chore(release): bump @opennsw/x to v1.2.3 (#NN)`, the squash of the bump PR.
  pattern="^chore\\(release\\): bump .* to v${version//./\\.}( \\(#[0-9]+\\))?\$"
  bump=$(git log "$main" --first-parent -1 --extended-regexp --grep="$pattern" --format=%H -- "packages/${pkg}/package.json")
  [ -n "$bump" ] || {
    echo "resolve.sh: no 'chore(release): bump … to v${version}' commit touching packages/${pkg}/package.json on $main." >&2
    echo "resolve.sh: pass --bump <sha> with the commit to release (it must be on $main)." >&2
    exit 3
  }
fi
bump=$(git rev-parse --verify "${bump}^{commit}") || die "unknown commit for --bump"
git merge-base --is-ancestor "$bump" "$main" || die "${bump} is not on $main"
at_bump=$(git show "${bump}:packages/${pkg}/package.json" | jq -r .version)
[ "$at_bump" = "$version" ] ||
  die "packages/${pkg}/package.json is ${at_bump} at ${bump:0:7} but ${version} on $main; pass --bump with the commit that set ${version}"

# --- The previous release -----------------------------------------------------
prev_tag="" prev_sha=""
if [ -n "$from" ]; then
  prev_sha=$(git rev-parse --verify "${from}^{commit}") || die "unknown ref for --from"
  prev_tag="$from"
else
  # Newest first, pre-releases (1.2.0-beta.1) before their release (1.2.0).
  while read -r candidate; do
    [ -n "$candidate" ] && [ "$candidate" != "$tag" ] || continue
    sha=$(git rev-parse --verify --quiet "${candidate}^{commit}") || continue
    if git merge-base --is-ancestor "$sha" "$bump"; then prev_tag="$candidate" prev_sha="$sha"; break; fi
  done < <(git -c versionsort.suffix=- tag --list "${pkg}-v*" --sort=-version:refname)
fi
[ -n "$prev_sha" ] || {
  echo "resolve.sh: no earlier ${pkg}-v* tag before ${bump:0:7}. Pass --from <ref> with the commit the notes should start after." >&2
  exit 3
}

echo "package=${pkg}"
echo "name=${name}"
echo "version=${version}"
echo "tag=${tag}"
echo "bump_sha=${bump}"
echo "prev_tag=${prev_tag}"
echo "prev_sha=${prev_sha}"

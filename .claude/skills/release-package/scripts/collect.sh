#!/usr/bin/env bash
# Collects what the release-package skill needs to write one package's release
# notes: every PR merged between two refs that belongs to the package, grouped
# the way the notes are, each with its "Release notes" section; then the PRs
# that were left out and why, and the ones that need a person's judgement.
# Read-only: it fetches nothing and edits nothing.
#
# A PR belongs to the package when it changes a file under packages/<pkg>/ OR
# carries the Package/<pkg> label. It is left out when it is labelled
# skip-changelog, is a `chore(release)` bump, or was opened by a bot.
#
# Usage: collect.sh --package <dir> --from <ref> [--to <ref>]     --to defaults to origin/main
set -euo pipefail

REPO=OpenNSW/ui-packages
usage() { echo "usage: collect.sh --package <dir> --from <ref> [--to <ref>]" >&2; exit 2; }

pkg="" from="" to="origin/main"
while [ $# -gt 0 ]; do
  case "$1" in
    --package) pkg="${2:-}"; shift 2 ;;
    --from) from="${2:-}"; shift 2 ;;
    --to) to="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$pkg" ] && [ -n "$from" ] && [ -n "$to" ] || usage
[[ "$pkg" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "collect.sh: '$pkg' is not a valid package directory name" >&2; exit 1; }
for ref in "$from" "$to"; do
  git rev-parse --verify --quiet "${ref}^{commit}" > /dev/null || { echo "collect.sh: unknown ref '$ref'" >&2; exit 1; }
done
for tool in gh jq; do
  command -v "$tool" > /dev/null || { echo "collect.sh: needs $tool" >&2; exit 1; }
done

pkg_label="Package/${pkg}"
pkg_path="packages/${pkg}/"
range="${from}..${to}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Squash merges end their subject with "(#NNN)"; the last one is the PR.
# A commit without one reached main without a PR; it is listed (if it touches
# the package) on its own.
git log --first-parent --reverse --format='%H%x09%s' "$range" > "$tmp/commits"
: > "$tmp/prs.jsonl"
: > "$tmp/direct"
n_total=0
while IFS=$'\t' read -r sha subject; do
  n=$(printf '%s\n' "$subject" | sed -nE 's/.*\(#([0-9]+)\)[[:space:]]*$/\1/p')
  # The files the commit changed against its parent (the whole commit, for the root).
  files=$(git diff-tree --root -r --name-only --no-commit-id "$sha" | jq -R . | jq -s -c .)
  if [ -z "$n" ]; then
    if jq -e --arg pp "$pkg_path" 'any(.[]; startswith($pp))' <<< "$files" > /dev/null; then
      printf '%s %s\n' "${sha:0:7}" "$subject" >> "$tmp/direct"
    fi
    continue
  fi
  n_total=$((n_total + 1))
  gh pr view "$n" --repo "$REPO" --json number,title,url,labels,author,body > "$tmp/pr.json"

  # One line of JSON per PR: whether it belongs to the package (out = null) or
  # why not, which section it lands in, its Release notes, and what needs a look.
  jq -c --arg pkg "$pkg" --arg pl "$pkg_label" --arg pp "$pkg_path" --argjson files "$files" '
    def has($n): any(.[]; . == $n);
    ([.labels[].name]) as $labels
    | (.title | capture("^(?<type>[a-z]+)(\\([^)]*\\))?(?<bang>!)?:")? // {type: "", bang: null}) as $t
    | ($files | map(select(startswith($pp)))) as $own
    | ($files | map(select(test("^packages/[^/]+/")) | sub("^packages/(?<d>[^/]+)/.*$"; .d)) | unique | map(select(. != $pkg))) as $others
    | ($labels | has($pl)) as $labelled
    | (any($labels[]; . == "breaking change" or startswith("Type/")) | not) as $unlabelled
    | (if   ($labels | has("skip-changelog"))                                 then "skip-changelog"
       elif (.title | test("^chore\\(release\\):"))                           then "a release bump"
       elif (.author.is_bot and ($labels | any(.[]?; startswith("Type/")) | not)) then "opened by a bot"
       elif ($labelled or ($own | length) > 0)                                then null
       else "belongs to another package" end) as $out
    | (if   ($labels | has("breaking change"))  then "Breaking Changes"
       elif ($labels | has("Type/New Feature")) then "New Features"
       elif ($labels | has("Type/Improvement")) then "Improvements"
       elif ($labels | has("Type/Bug"))         then "Bug Fixes"
       elif ($labels | has("Type/Task"))        then "Other Changes"
       elif $t.bang                             then "Breaking Changes"
       elif $t.type == "feat"                   then "New Features"
       elif $t.type == "fix"                    then "Bug Fixes"
       else "Other Changes" end) as $section
    | {number, title, url, author: .author.login, bot: .author.is_bot, out: $out, section: $section,
       flags: [
         (if $unlabelled then "no Type/* label; placed by its title" else empty end),
         (if $labelled and ($own | length) == 0 then "has \($pl) but changes nothing under \($pp)" else empty end),
         (if (($labelled | not) and ($own | length) > 0) then "changes \($pp) but has no \($pl) label" else empty end),
         (if ($others | length) > 0 then "also changes: \($others | join(", "))" else empty end)
       ],
       notes: (
         .body // "" | gsub("\r"; "") | gsub("(?s)<!--.*?-->"; "")
         | [scan("(?is)(?:^|\n)##[ \t]*Release notes[ \t]*\n(.*?)(?=\n##[ \t]|$)")] | (.[0][0] // "")
         | gsub("^\\s+|\\s+$"; "")
         | if (ascii_downcase | gsub("[\\s.]"; "")) as $x | ($x == "" or $x == "n/a" or $x == "na" or $x == "none" or $x == "-") then "" else . end
       )}
  ' "$tmp/pr.json" >> "$tmp/prs.jsonl"
done < "$tmp/commits"

n_in=$(jq -s '[.[] | select(.out == null)] | length' "$tmp/prs.jsonl")

# Who made a first contribution to the repository with a PR in this release?
included=$(jq -s -c '[.[] | select(.out == null) | .number]' "$tmp/prs.jsonl")
gh pr list --repo "$REPO" --state merged --limit 1000 --json number,url,author,mergedAt > "$tmp/merged.json"

echo "# Release input: ${pkg}, ${from} → ${to}"
echo
echo "${n_total} pull requests merged in this range; ${n_in} belong to ${pkg}."

for section in "Breaking Changes" "New Features" "Improvements" "Bug Fixes" "Other Changes"; do
  jq -r --arg s "$section" '
    select(.out == null and .section == $s)
    | "* \(.title) by @\(.author) in \(.url)"
      + (if (.flags | length) > 0 then "\n  - ⚠ " + (.flags | join("\n  - ⚠ ")) else "" end)
      + (if .notes != "" then "\n  - Release notes: " + (.notes | gsub("\n"; "\n    ")) else "" end)
  ' "$tmp/prs.jsonl" > "$tmp/section"
  if [ -s "$tmp/section" ]; then
    echo; echo "### ${section}"; echo; cat "$tmp/section"
  fi
done

jq -r --argjson inc "$included" '
  [.[] | select(.author.is_bot | not)] | group_by(.author.login)
  | map(sort_by(.mergedAt) | .[0])
  | map(select(.number as $n | any($inc[]; . == $n)))
  | sort_by(.mergedAt) | .[]
  | "* @\(.author.login) made their first contribution in \(.url)"
' "$tmp/merged.json" > "$tmp/newcomers"
if [ -s "$tmp/newcomers" ]; then
  echo; echo "### New Contributors"; echo; cat "$tmp/newcomers"
fi

jq -r 'select(.out != null) | "* #\(.number) \(.title) (@\(.author)): \(.out)"' "$tmp/prs.jsonl" > "$tmp/left_out"
if [ -s "$tmp/left_out" ]; then
  echo; echo "## Left out"; echo; cat "$tmp/left_out"
fi
if [ -s "$tmp/direct" ]; then
  echo; echo "## Commits to ${pkg} without a PR"; echo; sed 's/^/* /' "$tmp/direct"
fi

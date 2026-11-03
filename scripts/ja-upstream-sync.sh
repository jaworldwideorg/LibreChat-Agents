#!/usr/bin/env bash
set -euo pipefail

upstream_url="${1:-https://github.com/LibreChat-AI/agents.git}"
git fetch --no-tags "$upstream_url" main
upstream_sha="$(git rev-parse FETCH_HEAD)"
printf 'upstream_sha=%s\n' "$upstream_sha" >> "$GITHUB_OUTPUT"

if git merge-base --is-ancestor "$upstream_sha" HEAD; then
  printf 'changed=false\n' >> "$GITHUB_OUTPUT"
  exit 0
fi

fork_sha="$(git rev-parse HEAD)"
merge_status=0
git merge --no-commit --no-ff "$upstream_sha" || merge_status=$?

if git cat-file -e "$fork_sha:.github/workflows" 2>/dev/null; then
  git restore --source="$fork_sha" --staged --worktree .github/workflows
elif git ls-files .github/workflows | read -r _; then
  git rm -r --ignore-unmatch .github/workflows
fi

if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
  exit 1
fi
if [ "$merge_status" -ne 0 ] && ! git rev-parse --verify MERGE_HEAD >/dev/null 2>&1; then
  exit "$merge_status"
fi
printf 'changed=true\n' >> "$GITHUB_OUTPUT"

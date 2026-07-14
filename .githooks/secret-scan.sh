#!/usr/bin/env bash
# Shared secret scanner — single source of truth for the secret-leak guard.
# Scans a git diff for secrets and exits 1 (printing the reason to stderr) if
# any are found, else 0.
#
# Entry points that call this:
#   .githooks/pre-commit                       → --staged
#   .githooks/pre-push                         → --range @{upstream} HEAD
#   .claude/hooks/pre-git-secret-scan.sh       → both (Claude Code PreToolUse)
#
# Usage: secret-scan.sh [--staged | --range <base> <head>]
set -uo pipefail

mode="${1:---staged}"
case "$mode" in
  --staged)
    diff_names() { git diff --cached --name-only "$@"; }
    diff_all()   { git diff --cached "$@"; }
    ;;
  --range)
    base="${2:-}"; head="${3:-HEAD}"
    # If base can't be resolved (e.g. no upstream on a brand-new branch),
    # skip — pre-commit already guards content before it enters history.
    git rev-parse --verify --quiet "$base" >/dev/null || exit 0
    diff_names() { git diff "${base}..${head}" --name-only "$@"; }
    diff_all()   { git diff "${base}..${head}" "$@"; }
    ;;
  *)
    echo "usage: secret-scan.sh [--staged | --range <base> <head>]" >&2
    exit 2
    ;;
esac

# File paths that must never be committed (matched against changed file names).
badfile_regex='\.key$|\.cer$|\.pfx$|\.p12$|(^|/)auth/state\.json$|test-data/envs/(qa|staging)\.json$'

names=$(diff_names | sort -u)
content_all=$(diff_all)
# The e.firma password literal is scanned everywhere EXCEPT the files that
# legitimately name it: the scanners themselves and the rule docs.
content_pw=$(diff_all -- . \
  ':(exclude).githooks/**' \
  ':(exclude).claude/hooks/**' \
  ':(exclude)CLAUDE.md' \
  ':(exclude)README.md')

violations=""
bad_names=$(printf '%s\n' "$names" | grep -Ei "$badfile_regex" || true)
[ -n "$bad_names" ] && violations="${violations}Sensitive file(s) in the change:
${bad_names}
"
if printf '%s' "$content_all" | grep -Eq -- '-----BEGIN [A-Z ]*PRIVATE KEY-----'; then
  violations="${violations}A PRIVATE KEY block was found in changed content.
"
fi
if printf '%s' "$content_pw" | grep -q 'delfin40'; then
  violations="${violations}The e.firma password 'delfin40' was found in changed content.
"
fi

if [ -n "$violations" ]; then
  {
    echo "BLOCKED to prevent a secret leak:"
    printf '%s\n' "$violations"
    echo "Keep secrets only in the gitignored test-data/envs/qa.json, then unstage/scrub and retry."
  } >&2
  exit 1
fi

exit 0

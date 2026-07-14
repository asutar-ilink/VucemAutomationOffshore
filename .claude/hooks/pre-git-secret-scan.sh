#!/usr/bin/env bash
# PreToolUse hook — blocks `git commit` / `git push` when the staged or
# not-yet-pushed content contains a secret. Reads the hook JSON on stdin.
#
# Wired in .claude/settings.json under hooks.PreToolUse (matcher "Bash").
# Blocks by exiting 2 and printing the reason to stderr (no jq dependency).
set -uo pipefail

input=$(cat)

# Only act on commit/push — let every other command through untouched.
# (Detect from the raw payload so we don't depend on jq being installed.)
if ! printf '%s' "$input" | grep -Eq 'git[[:space:]]+(commit|push)'; then
  exit 0
fi

# File paths that must never be committed (matched against changed file names).
badfile_regex='\.key$|\.cer$|\.pfx$|\.p12$|(^|/)auth/state\.json$|test-data/envs/(qa|staging)\.json$'

# Collect staged changes (commit) plus commits not yet on the upstream (push).
gitdiff() { git diff --cached "$@"; git diff @{upstream}..HEAD "$@" 2>/dev/null; }

names=$(gitdiff --name-only | sort -u)
content_all=$(gitdiff)
# The e.firma password literal is scanned everywhere EXCEPT the files that
# legitimately name it: this scanner and the rule docs (CLAUDE.md/README.md).
content_pw=$(gitdiff -- . ':(exclude).claude/hooks/**' ':(exclude)CLAUDE.md' ':(exclude)README.md')

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
  exit 2
fi

exit 0

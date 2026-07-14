#!/usr/bin/env bash
# Claude Code PreToolUse hook — blocks `git commit` / `git push` when the staged
# or not-yet-pushed content contains a secret. Reads the hook JSON on stdin.
#
# Wired in .claude/settings.json under hooks.PreToolUse (matcher "Bash").
# Delegates the actual scanning to .githooks/secret-scan.sh (single source of
# truth, shared with the git-native pre-commit/pre-push hooks). Blocks by
# exiting 2 and forwarding the scanner's reason to stderr.
set -uo pipefail

input=$(cat)

# Only act on commit/push — let every other command through untouched.
# (Detect from the raw payload so we don't depend on jq being installed.)
if ! printf '%s' "$input" | grep -Eq 'git[[:space:]]+(commit|push)'; then
  exit 0
fi

scanner="$(dirname "$0")/../../.githooks/secret-scan.sh"

# Scan staged changes (commit) and commits not yet on the upstream (push).
# Either scanner exiting non-zero means block the tool call.
if ! bash "$scanner" --staged || ! bash "$scanner" --range "@{upstream}" "HEAD"; then
  exit 2
fi

exit 0

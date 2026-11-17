#!/usr/bin/env bash
# Installs the js-ts-performance-audit skill for Claude Code, Codex and OpenCode.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/bertolo1988/js-ts-performance-audit/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/bertolo1988/js-ts-performance-audit/main/install.sh | bash -s -- claude codex
#
# Targets: claude, codex, opencode (default: all three).
set -euo pipefail

SKILL="js-ts-performance-audit"
REF="${SKILL_REF:-main}"
URL="https://codeload.github.com/bertolo1988/${SKILL}/tar.gz/${REF}"

dir_for() {
  case "$1" in
    claude)   echo "${CLAUDE_HOME:-$HOME/.claude}/skills" ;;
    codex)    echo "${CODEX_HOME:-$HOME/.codex}/skills" ;;
    opencode) echo "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills" ;;
    *) return 1 ;;
  esac
}

targets=("$@")
[ ${#targets[@]} -eq 0 ] && targets=(claude codex opencode)

# Download the repository once and take the whole skill directory from it,
# so SKILL.md and its reference files are installed together.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL" | tar -xz -C "$tmp" --strip-components=1
src="$tmp/skills/$SKILL"
[ -f "$src/SKILL.md" ] || { echo "No skills/$SKILL/SKILL.md found at ref '$REF'" >&2; exit 1; }

for t in "${targets[@]}"; do
  base="$(dir_for "$t")" || { echo "Unknown target: $t (use claude, codex, opencode)" >&2; exit 1; }
  mkdir -p "$base/$SKILL"
  cp -R "$src/." "$base/$SKILL/"
  echo "Installed $SKILL for $t -> $base/$SKILL/"
done

#!/usr/bin/env bash
# Installs the js-ts-performance-audit skill for Claude Code, Codex and OpenCode.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/bertolo1988/js-ts-performance-audit/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/bertolo1988/js-ts-performance-audit/main/install.sh | bash -s -- claude codex
#
# Targets: claude, codex, opencode.
# With no arguments, installs only for the agents whose config folder exists.
# Named targets are installed even when their config folder does not exist yet.
set -euo pipefail

SKILL="js-ts-performance-audit"
REF="${SKILL_REF:-main}"
URL="https://codeload.github.com/bertolo1988/${SKILL}/tar.gz/${REF}"
ALL_TARGETS=(claude codex opencode)

# Config folder of each agent. The skill goes in its skills/ subfolder.
home_for() {
  case "$1" in
    claude)   echo "${CLAUDE_HOME:-$HOME/.claude}" ;;
    codex)    echo "${CODEX_HOME:-$HOME/.codex}" ;;
    opencode) echo "${XDG_CONFIG_HOME:-$HOME/.config}/opencode" ;;
    *) return 1 ;;
  esac
}

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  for t in "${ALL_TARGETS[@]}"; do
    if [ -d "$(home_for "$t")" ]; then
      targets+=("$t")
    else
      echo "Skipping $t: $(home_for "$t") not found"
    fi
  done
  if [ ${#targets[@]} -eq 0 ]; then
    echo "No agent config folder found (checked claude, codex, opencode). Name a target to install anyway, e.g. bash -s -- claude" >&2
    exit 1
  fi
fi

# Download the repository once and take the whole skill directory from it,
# so SKILL.md and its reference files are installed together.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL" | tar -xz -C "$tmp" --strip-components=1
src="$tmp/skills/$SKILL"
[ -f "$src/SKILL.md" ] || { echo "No skills/$SKILL/SKILL.md found at ref '$REF'" >&2; exit 1; }

for t in "${targets[@]}"; do
  home="$(home_for "$t")" || { echo "Unknown target: $t (use claude, codex, opencode)" >&2; exit 1; }
  dest="$home/skills/$SKILL"
  mkdir -p "$dest"
  cp -R "$src/." "$dest/"
  echo "Installed $SKILL for $t -> $dest/"
done

# js-ts-performance-audit

An agent skill that audits existing JavaScript and TypeScript projects for runtime performance, memory allocations, caching, and dead code. Use it when reviewing, optimizing, refactoring, or auditing a JS/TS codebase, repository, or module to reduce allocations, replace O(n^2) scans with `Map`/`Set`, suggest bounded memoization, prune unnecessary exports, and remove dead code.

> **Status:** work in progress. The skill's instructions are not written yet; `SKILL.md` currently contains only its metadata.

## Install

Installs the skill for Claude Code, Codex, and OpenCode:

```bash
curl -fsSL https://raw.githubusercontent.com/bertolo1988/js-ts-performance-audit/main/install.sh | bash
```

To install for specific tools only, pass them as arguments (`claude`, `codex`, `opencode`):

```bash
curl -fsSL https://raw.githubusercontent.com/bertolo1988/js-ts-performance-audit/main/install.sh | bash -s -- claude codex
```

| Tool        | Install location                                   |
| ----------- | -------------------------------------------------- |
| Claude Code | `~/.claude/skills/js-ts-performance-audit/`        |
| Codex       | `~/.codex/skills/js-ts-performance-audit/`         |
| OpenCode    | `~/.config/opencode/skills/js-ts-performance-audit/` |

Re-run the command at any time to update to the latest version.

### Options

Environment variables read by the installer:

- `SKILL_REF`: Git branch, tag, or commit to install from (default: `main`).
- `CLAUDE_HOME`, `CODEX_HOME`, `XDG_CONFIG_HOME`: override the base directories above.

## Repository layout

- `skills/js-ts-performance-audit/SKILL.md`: the skill itself.
- `install.sh`: the installer.

## License

See [LICENSE](LICENSE).

# js-ts-performance-audit

An agent skill that audits existing JavaScript and TypeScript projects for runtime performance, memory allocations, caching, and dead code. Use it when reviewing, optimizing, refactoring, or auditing a JS/TS codebase, repository, or module to reduce allocations, replace O(n^2) scans with `Map`/`Set`, suggest bounded memoization, and remove dead code that is bundled or loaded.

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

- `skills/js-ts-performance-audit/SKILL.md`: the skill itself: audit workflow, optimization rules, and report format.
- `skills/js-ts-performance-audit/references/`: files the skill reads only when they apply.
  - `node-services.md`: event-loop blocking and data-access checks for Node servers and workers.
  - `hot-path-rules.md`: micro-rules for functions a profile shows are hot, each with its measured gain.
  - `verifying.md`: how to measure a change, and the profiling commands to use.
  - `dead-code.md`: running and configuring Knip and `tsc`.
- `evals/`: trigger and quality tests for the skill. See [evals/README.md](evals/README.md).
- `install.sh`: the installer. It copies the whole skill directory.

## License

See [LICENSE](LICENSE).

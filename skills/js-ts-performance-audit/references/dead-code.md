# Finding Dead Code with Knip

Read this file before running Knip. Report only unused files and dependencies: they are bundled or loaded. Unused exports, types, and locals have no runtime cost, so leave them out of the report. Everything Knip reports is a candidate, not a verdict: confirm each one against dynamic imports, framework entry points, and tests before removing it.

## Running the tools

- **Use the project's own copy.** Run its `knip` script when `package.json` has one, or `npx --no-install knip`. `--no-install` makes `npx` fail instead of downloading a package.
- **Ask before fetching Knip into a project that does not have it.** Plain `npx knip` downloads and runs the latest release inside the audited repository.
- **Never run `knip --fix` unless the user asks.** It edits and deletes files.

## Configuring Knip before trusting its output

An unconfigured run reports many false positives. Fix the configuration before deciding that a result is wrong.

- **Work through the configuration hints first.** Knip prints them under "Configuration hints", after the results. Treat them as the to-do list and resolve each one in `knip.json`.
- **Fix the configuration, do not hide results.** Avoid broad `ignore` patterns. Remove `ignore` and `entry` patterns that match nothing or repeat what `.gitignore` already excludes; Knip respects `.gitignore`.
- **Enable or disable plugins explicitly** when a tool's config file is reported as unused, for example `{ "vite": true }`.
- **Declare path aliases** under `paths`, using the same semantics as `tsconfig.json`.
- **List packages named like Node built-ins** under `ignoreDependencies`.

For entry points and monorepo workspaces, follow the documentation at knip.dev. Knip also publishes an MCP server, `@knip/mcp`, for agents that can use one.

Editing `knip.json` changes the audited repository. Propose the configuration in the report, and write it only when the user has asked for edits.

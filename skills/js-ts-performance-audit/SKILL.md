---
name: js-ts-performance-audit
description: Audit existing JavaScript and TypeScript projects for runtime performance, memory allocations, caching, and dead code. Use when reviewing, optimizing, refactoring, or auditing a JS/TS codebase, repository, or module to reduce allocations, replace O(n^2) scans with Map/Set, add bounded memoization, prune unnecessary exports, and remove dead code.
---

# JS/TS Performance Audit

Audit existing JavaScript and TypeScript projects to identify and fix runtime bottlenecks, unnecessary memory allocations, unbounded caching, bloated module exports, and dead code.

## When to Use

- Auditing an existing JS/TS repository, service, or module for performance and memory improvements.
- Reviewing pull requests or hot paths for unnecessary copies, slow loops, or algorithmic complexity.
- Cleaning up unused exports, dead branches, and obsolete files in mature projects.
- Introducing safe, bounded in-memory memoization for repeated computations or async lookups.

## Audit Workflow

1. **Scope the codebase and hot paths**
   - Identify entry points, request handlers, data transformation pipelines, loops, and shared utilities.
   - Prioritize code executed per request, per frame, or over large collections before touching cold startup code.

2. **Analyze allocations, loops, and data structures**
   - Scan for unnecessary array/object copies, chained array passes, callback-heavy iterations, and linear array scans.

3. **Evaluate caching and async execution**
   - Check repeated pure computations or duplicate async fetches that benefit from bounded memoization.
   - Check sequential `await` statements that can run concurrently.

4. **Audit module boundaries and dead code**
   - Inspect `export` statements to find symbols never imported outside their defining file.
   - Identify unreachable code, unused variables/parameters, and orphaned files. When terminal access is available, run project checks such as `npx knip` or `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.

5. **Report and apply improvements**
   - Present findings ordered by expected impact (High, Medium, Low) with file paths, why the current pattern hurts performance or maintainability, and concrete before/after code diffs.
   - Apply edits cleanly when requested and verify existing tests and type checks still pass.

## Optimization Rules

### Memory and Allocation Efficiency

- **Avoid unnecessary spread operators (`...`)**: Spreading arrays or objects inside loops or `.reduce()` (`[...acc, item]` or `{ ...acc, [k]: v }`) allocates a full copy on every step, turning O(n) work into O(n^2) time and memory. Mutate local structures created inside the function scope instead.
- **Collapse chained array pipelines in hot paths**: Chaining `.filter().map().filter()` allocates an intermediate array at every stage. Combine multi-step transformations over large datasets into a single `for...of` loop.
- **Replace `JSON.parse(JSON.stringify(x))` with `structuredClone()`**: JSON round-tripping allocates large temporary strings, blocks the event loop, and corrupts `Date`, `Map`, `Set`, and `undefined` values. Use `structuredClone()` when a deep copy is required, or shallow-copy only modified branches.
- **Avoid `delete obj.prop` on frequently accessed objects**: Deleting properties forces V8 to transition objects out of fast hidden-class shapes into slow dictionary mode. Set properties to `undefined` or omit them during object construction.

### Loops and Data Structures

- **Prefer `for...of` over `.forEach()`**: `.forEach()` allocates and invokes a closure per element, prevents `break`, `continue`, and early `return`, and cannot `await` sequentially. Use `for...of` for iterables, or indexed `for (let i = 0; i < arr.length; i++)` in tight numeric loops.
- **Guard `for...in` or prefer `Object.keys()` / `Object.entries()`**: `for...in` traverses enumerable prototype properties unless guarded with `Object.hasOwn(obj, key)`. Prefer `for (const key of Object.keys(obj))` when iterating own keys.
- **Use `Map` and `Set` for auxiliary lookups**: Replace `array.includes()`, `array.indexOf()`, or `array.find()` inside loops with `Set.has()` or `Map.get()` to turn O(n * m) lookups into O(1) average operations.
- **Deduplicate with `Set`**: Replace `arr.filter((v, i) => arr.indexOf(v) === i)` (O(n^2)) with `[...new Set(arr)]` (O(n)).

### Caching and Memoization

- **Memoize repeated expensive work with strict bounds**: Use `memoize` (sync) or `p-memoize` (async) from npm, or an LRU cache, when the same inputs repeat frequently.
- **Enforce a maximum entry limit**: Always configure `maxSize` (or equivalent cache size cap) and a `maxAge` / TTL when data can go stale. Never introduce an unbounded cache in a long-running process.
- **Verify cache key cardinality**: Do not memoize functions whose arguments are unique per request (such as request objects, timestamps, or random IDs), as cache misses add overhead without hits.
- **Hoist `RegExp` and `Intl.*` instances**: Move `new RegExp(...)`, `new Intl.DateTimeFormat(...)`, and `new Intl.NumberFormat(...)` out of functions and loops to module scope so patterns and locale tables are compiled once.

### Async and I/O Throughput

- **Parallelize independent `await` calls**: Replace sequential `const a = await fetchA(); const b = await fetchB();` with `const [a, b] = await Promise.all([fetchA(), fetchB()])` when operations do not depend on each other.
- **Stream large payloads**: Avoid buffering multi-megabyte files or responses in memory with `readFile` or `.json()`. Process chunks incrementally with streams or `for await (const chunk of stream)`.
- **Clean up timers, listeners, and aborted requests**: Ensure `setInterval`, event listeners, and `AbortController` signals are disposed on teardown to prevent memory leaks.

### Module Hygiene, TypeScript, and Dead Code

- **Avoid unnecessary `export` keywords**: Keep helper functions, types, and constants module-private unless imported by another file. Unnecessary exports prevent tree-shaking, obscure the module's public API, and slow down TypeScript incremental builds.
- **Eliminate dead code**: Remove unreachable branches, unused variables, obsolete feature flags, and unreferenced files. Check dynamic imports, framework entry points, and test files before deleting symbols.
- **Avoid bloated barrel files (`index.ts`)**: Re-exporting entire directories via `export * from './...'` forces bundlers and TypeScript to load and type-check unused modules. Import directly from concrete module paths.
- **Use `import type` and union types in TypeScript**: Mark type-only imports with `import type` so they erase cleanly at compile time, and prefer string literal unions or `as const` objects over `enum` to avoid runtime wrapper code.

## Output Format

Structure audit reports using the following sections:

1. **Summary**: High-level overview of findings grouped by category and estimated impact.
2. **Findings**: Ordered by impact (`High`, `Medium`, `Low`). For each item include:
   - File path and line range
   - Rule violated and why it impacts speed, memory, or bundle size
   - Concrete before and after code snippet
3. **Dead Code and Unused Exports**: List of candidate unused exports, variables, and files, noting any dynamic entry points that require manual confirmation.

## Gotchas

- **Do not sacrifice clarity on cold paths**: Skip micro-optimizations in one-off setup scripts or tiny fixed-size arrays (fewer than 10 items) where readability matters more than nanoseconds.
- **Respect public package boundaries**: In libraries or monorepo packages, verify `package.json` `exports` and `main` entry points before flagging exported symbols as unused.
- **Check memoization side effects**: Never memoize functions that mutate their return values or rely on ambient mutable state unless callers treat results as immutable.

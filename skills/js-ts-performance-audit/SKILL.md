---
name: js-ts-performance-audit
description: Audit existing JavaScript and TypeScript projects for runtime performance, memory allocations, caching, and dead code. Use when reviewing, optimizing, refactoring, or auditing a JS/TS codebase, repository, or module to reduce allocations, replace O(n^2) scans with Map/Set, suggest bounded memoization, prune unnecessary exports, and remove dead code.
---

# JS/TS Performance Audit

Audit existing JavaScript and TypeScript projects to identify and fix runtime bottlenecks, unnecessary memory allocations, unbounded caching, bloated module exports, and dead code.

## When to Use

- Auditing an existing JS/TS repository, service, or module for performance and memory improvements.
- Reviewing pull requests or hot paths for unnecessary copies, slow loops, or algorithmic complexity.
- Cleaning up unused exports, dead branches, and obsolete files in mature projects.
- Finding repeated access to the same resource, result, or database query that could be cached with the user's approval.

## Audit Workflow

1. **Scope the codebase and hot paths**
   - Identify entry points, request handlers, data transformation pipelines, loops, and shared utilities.
   - Prioritize code executed per request, per frame, or over large collections before touching cold startup code.

2. **Analyze allocations, loops, and data structures**
   - Scan for unnecessary array/object copies, chained array passes, callback-heavy iterations, and linear array scans.

3. **Evaluate caching and async execution**
   - Look for the same resource, result, or database query being fetched or computed repeatedly with the same inputs. These are memoization candidates to raise with the user, not changes to apply.
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

- **Suggest memoization only for frequent access to the same thing**: A cache is a candidate only where the code reads the same resource, recomputes the same result, or runs the same database query many times with the same inputs. Arguments that are unique per call (request objects, timestamps, random IDs) never hit, so those functions are not candidates.
- **Confirm with the user before adding a cache**: Memoization is a suggestion, never an edit applied with the other fixes. Tell the user what would be cached, the key, the entry limit, and how stale a value may get, then ask whether they want it. Adding the `lru-cache` dependency is part of what they approve.
- **Use `lru-cache`**: Once approved, build the cache with `lru-cache` from npm. Always set `max` (entry limit), add `ttl` when the data can go stale, and use `maxSize` with `sizeCalculation` when values vary widely in size. Build the key from every input that changes the result. For async lookups, pass `fetchMethod` and call `cache.fetch(key)` so concurrent calls for one key share a single request. Never use an unbounded `Map` or object as a cache in a long-running process.

  ```ts
  import { LRUCache } from 'lru-cache';

  const users = new LRUCache<string, User>({
    max: 500,
    ttl: 60_000,
    fetchMethod: (id) => db.users.findById(id),
  });

  const user = await users.fetch(id);
  ```

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
4. **Memoization Candidates (confirmation required)**: For each candidate, what is accessed repeatedly, the proposed key, the `max` entry limit, and the `ttl`. End the section by asking the user which candidates to apply.

## Gotchas

- **Do not sacrifice clarity on cold paths**: Skip micro-optimizations in one-off setup scripts or tiny fixed-size arrays (fewer than 10 items) where readability matters more than nanoseconds.
- **Respect public package boundaries**: In libraries or monorepo packages, verify `package.json` `exports` and `main` entry points before flagging exported symbols as unused.
- **Check memoization side effects**: Never memoize functions that mutate their return values or rely on ambient mutable state unless callers treat results as immutable.

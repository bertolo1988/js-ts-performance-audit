---
name: js-ts-performance-audit
description: Audit existing JavaScript and TypeScript projects for runtime performance, memory allocations, caching, and dead code. Use when reviewing, optimizing, refactoring, or auditing a JS/TS codebase, repository, or module to reduce allocations, replace O(n^2) scans with Map/Set, suggest bounded memoization, and remove dead code that is bundled or loaded.
---

# JS/TS Performance Audit

Audit existing JavaScript and TypeScript projects to identify and fix runtime bottlenecks, unnecessary memory allocations, unbounded caching, and dead code that is bundled or loaded at runtime. Report only changes that make the code faster, use less memory, or ship less code.

## When to Use

- Auditing an existing JS/TS repository, service, or module for performance and memory improvements.
- Reviewing pull requests or hot paths for unnecessary copies, slow loops, or algorithmic complexity.
- Removing unreferenced files and unused dependencies that are bundled or loaded at runtime.
- Finding repeated access to the same resource, result, or database query that could be cached with the user's approval.

## Reference Files

Read each file only when its condition holds.

| File | Read it when |
| --- | --- |
| `references/node-services.md` | The code handles requests or jobs in Node (HTTP server, queue worker, serverless handler). |
| `references/hot-path-rules.md` | A profile or benchmark shows one specific function is hot. |
| `references/verifying.md` | You can run code and are about to measure, profile, or benchmark. |
| `references/dead-code.md` | You are about to run Knip to find dead code. |

## Audit Workflow

1. **Scope the codebase and hot paths**
   - Identify entry points, request handlers, data transformation pipelines, loops, and shared utilities.
   - Prioritize code executed per request, per frame, or over large collections before touching cold startup code.

2. **Analyze allocations, loops, and data structures**
   - Scan for unnecessary array/object copies, chained array passes, and linear array scans.

3. **Evaluate caching and async execution**
   - Look for the same resource, result, or database query being fetched or computed repeatedly with the same inputs. These are memoization candidates to raise with the user, not changes to apply.
   - Check sequential `await` statements that can run concurrently, and `Promise.all` over inputs of unknown length that needs a concurrency cap.

4. **Audit dead code that is bundled or loaded**
   - Identify orphaned files and unused dependencies that still reach a bundle or are loaded at runtime. When terminal access is available, run Knip as described in `references/dead-code.md`.

5. **Report**
   - Present findings in the Output Format below, each with its tier and evidence label.

6. **Apply and verify, one change at a time** (only when the user asks for edits)
   - Measure a representative workload before changing code. That number is the baseline. Commands are in `references/verifying.md`.
   - Apply one change, so its result can be attributed to it.
   - Check behaviour first (tests, type check, identical output) and timing second.
   - Keep the change only when the gain exceeds run-to-run noise. Measure the unchanged code twice to see the noise. Revert a neutral or slower result.
   - A faster result that skips validation, serves stale data, or drops an `await` is a regression, not a win.
   - Record every attempt, including reverted ones, in the report or pull request description: the idea, baseline, result, and verdict. This stops dead ideas being retried.
   - When code cannot be run, apply only changes that reduce algorithmic complexity and label them `static suspicion`.

## Optimization Rules

### Memory and Allocation Efficiency

- **Avoid unnecessary spread operators (`...`)**: Spreading arrays or objects inside loops or `.reduce()` (`[...acc, item]` or `{ ...acc, [k]: v }`) allocates a full copy on every step, turning O(n) work into O(n^2) time and memory. Mutate local structures created inside the function scope instead.
- **Collapse chained array pipelines in hot paths**: Chaining `.filter().map().filter()` allocates an intermediate array at every stage. Combine multi-step transformations over large datasets into a single `for...of` loop. `flatMap()` is not a fix: it measured slower than `filter().map()`.
- **Avoid deep copies**: The deep copy is the cost, whichever API makes it. `structuredClone()` measured slower than `JSON.parse(JSON.stringify(x))` on plain data, and both block the event loop. Copy only the branches that change, with spread or `Object.assign`. Never swap one deep-copy API for another: `structuredClone()` keeps `Date`, `Map`, `Set`, and `undefined` values that a JSON round-trip converts or drops, so the swap changes what callers receive.
- **Avoid `delete obj.prop` on frequently accessed objects**: Deleting properties forces V8 to transition objects out of fast hidden-class shapes into slow dictionary mode. Set properties to `undefined` or omit them during object construction.
- **Do not recommend object pooling or reuse without a measurement**: V8 allocates and collects short-lived objects of one shape cheaply, so a pool often costs more than it saves.

### Loops and Data Structures

- **Use `for...of` when the loop needs `break`, `continue`, early `return`, or sequential `await`**: `.forEach()` supports none of them. Do not flag `.forEach()` for speed: with an inline callback it measured about the same as `for...of`. A callback only costs more when it escapes (stored, registered, or compared by identity).
- **Use `Map` and `Set` for auxiliary lookups**: Replace `array.includes()`, `array.indexOf()`, or `array.find()` inside loops with `Set.has()` or `Map.get()` to turn O(n * m) lookups into O(1) average operations.
- **Deduplicate with `Set`**: Replace `arr.filter((v, i) => arr.indexOf(v) === i)` (O(n^2)) with `[...new Set(arr)]` (O(n)).
- **Find a minimum or maximum in one pass**: Sorting a copy to read its first or last element is O(n log n) and measured 270 times slower than a single loop over 100,000 numbers. `Math.max(...arr)` throws `RangeError` on large arrays, so use a loop there too.
- **Binary-search arrays that are already sorted**: `findIndex()` and `indexOf()` scan the whole array. Use a binary search only when the code guarantees the sort order.

### Caching and Memoization

- **Suggest memoization only for frequent access to the same thing**: A cache is a candidate only where the code reads the same resource, recomputes the same result, or runs the same database query many times with the same inputs. Arguments that are unique per call (request objects, timestamps, random IDs) never hit, so those functions are not candidates.
- **Never cache data that must be fresh**: Account balances, permissions, and stock at checkout are read live. They are not candidates, however often they are read.
- **Confirm with the user before adding a cache**: Memoization is a suggestion, never an edit applied with the other fixes. Tell the user what would be cached, the key, the entry limit, how stale a value may get, and how entries are invalidated when the source data changes, then ask whether they want it. Adding the `lru-cache` dependency is part of what they approve.
- **Use `lru-cache`**: Once approved, build the cache with `lru-cache` from npm. Always set `max` (entry limit), add `ttl` when the data can go stale, and use `maxSize` with `sizeCalculation` when values vary widely in size. For async lookups, pass `fetchMethod` and call `cache.fetch(key)` so concurrent calls for one key share a single request instead of stampeding the source. Never use an unbounded `Map` or object as a cache in a long-running process.

  ```ts
  import { LRUCache } from 'lru-cache';

  const users = new LRUCache<string, User>({
    max: 500,
    ttl: 60_000,
    fetchMethod: (id) => db.users.findById(id),
  });

  const user = await users.fetch(id);
  ```

- **Put every input that changes the result in the key**: A module-level cache is shared by all requests. When a result varies by user, tenant, locale, or permissions, that value belongs in the key, or one caller receives another caller's data.
- **Use a `WeakMap` when the key is an object**: For data derived from an object whose lifetime the cache must not extend (a parsed node, a request-scoped object), a `WeakMap` drops the entry when the key is collected. `lru-cache` is for keys that are values, such as IDs and strings.
- **Hoist `RegExp`, `Intl.*`, and static reads**: Move `new RegExp(...)`, `new Intl.DateTimeFormat(...)`, `new Intl.NumberFormat(...)`, and reads of files that never change (templates, fonts, logos) out of functions and loops to module scope so they are built or loaded once.

### Async and I/O Throughput

- **Parallelize independent `await` calls**: Replace sequential `const a = await fetchA(); const b = await fetchB();` with `const [a, b] = await Promise.all([fetchA(), fetchB()])` when operations do not depend on each other. Inside a per-item loop, run that item's independent calls in parallel as well.
- **Bound concurrency over inputs of unknown length**: `Promise.all(items.map(fn))` starts every call at once. With thousands of items it exhausts memory, sockets, file descriptors, or the database pool. Cap it with `p-map` (`{ concurrency: n }`) or `p-limit` when the project already depends on one. Otherwise process fixed-size chunks, or ask before adding the dependency.
- **Do not `await` values that are never promises in hot loops**: Each `await` yields to the microtask queue. Awaiting a plain value 10,000 times measured about 90 times slower than the same loop without it. Leave `return await` inside a `try` block alone, and do not remove `async` from a function other modules call: both change error handling.
- **Stream large payloads**: Avoid buffering multi-megabyte files or responses in memory with `readFile` or `.json()`. Process chunks incrementally with streams or `for await (const chunk of stream)`.
- **Clean up timers, listeners, and aborted requests**: Ensure `setInterval`, event listeners, and `AbortController` signals are disposed on teardown to prevent memory leaks.

### Bundle Size and Load Time

- **Remove dead code that ships**: Unreferenced files, unused dependencies, and branches behind obsolete feature flags add to the bundle or to startup. Check dynamic imports, framework entry points, and test files before deleting anything.
- **Avoid bloated barrel files (`index.ts`)**: Re-exporting entire directories via `export * from './...'` forces bundlers and TypeScript to load and type-check unused modules. Import directly from concrete module paths.
- **Lazy-load heavy modules that most runs never use**: In CLIs, serverless handlers, and browser bundles, load a rarely used module with `await import('./report.js')` inside the branch that needs it, and load feature modules only when the feature is enabled. Write the path as a string literal so bundlers can resolve and split it; a computed path defeats that. Do not lazy-load on the request path of a long-running server: that moves the cost from startup to a user's first request.

## Output Format

Structure audit reports using the following sections:

1. **Summary**: High-level overview of findings grouped by category and estimated impact.
2. **Findings**: Ordered by impact. Place each finding in exactly one tier:
   - `High`: the cost grows with input size or repeats per request or per item on a hot path (O(n^2) work, a query per item, a blocked event loop, unbounded memory or concurrency).
   - `Medium`: a constant-factor cost on a hot path.
   - `Low`: a cold-path cost, such as startup time or bundle size.

   For each finding include:
   - File path and line range
   - Rule violated and why it impacts speed, memory, or bundle size
   - **Evidence**: `measured` with the numbers and the command that produced them, or `static suspicion` when nothing was run
   - **Needs confirmation**, when the finding depends on something the code does not show, such as data size, call frequency, or dynamic usage
   - Concrete before and after code snippet
3. **Dead Code**: Candidate unreferenced files, unused dependencies, and dead branches that ship, noting any dynamic entry points that require manual confirmation.
4. **Memoization Candidates (confirmation required)**: For each candidate, what is accessed repeatedly, the proposed key, the `max` entry limit, the `ttl`, and how entries are invalidated. End the section by asking the user which candidates to apply.
5. **Coverage**: The hot paths that were examined and found fine, and the parts of the codebase that were not examined.

## Gotchas

- **Report only performance gains**: Every finding must make the code faster, use less memory, or ship less code. Never report style, readability, type-safety, naming, or API-hygiene changes, unused exports, types, or locals, or any change to what callers receive.
- **Do not sacrifice clarity on cold paths**: Skip micro-optimizations in one-off setup scripts or tiny fixed-size arrays (fewer than 10 items) where readability matters more than nanoseconds.
- **Make no unmeasured claims**: State a speedup, a percentage, or "faster" as fact only for something that was measured in this audit. Everything else is a `static suspicion` and is worded as one.
- **Do not flag what the engine already optimizes**: V8 can inline non-escaping callbacks and identity wrappers, hoist loop-invariant conditions, and remove branches guarded by a constant. Rewriting them needs profiler or benchmark evidence first.
- **Respect public package boundaries**: In libraries or monorepo packages, verify `package.json` `exports` and `main` entry points before flagging a file as unreferenced.
- **Check memoization side effects**: Never memoize functions that mutate their return values or rely on ambient mutable state unless callers treat results as immutable.

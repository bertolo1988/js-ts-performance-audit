---
name: js-ts-performance-audit
description: Audit existing JavaScript and TypeScript projects for runtime performance, memory allocations, caching, and dead code. Use when reviewing, optimizing, refactoring, or auditing a JS/TS codebase, repository, or module to reduce allocations, replace O(n^2) scans with Map/Set, suggest bounded memoization, and remove dead code that is bundled or loaded.
---

# JS/TS Performance Audit

Audit existing JavaScript and TypeScript projects to identify and fix runtime bottlenecks, unnecessary memory allocations, unbounded caching, and dead code that is bundled or loaded at runtime. Report only changes that make the code faster, use less memory, or ship less code. Each audit has one goal, speed or cost, chosen in step 1 of the workflow.

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
| `references/hot-path-rules.md` | Code runs per item, per request, or inside a loop. |
| `references/verifying.md` | The user asks for timings or a profile, or nothing in the code shows where time goes. |
| `references/dead-code.md` | You are about to run Knip to find dead code. |

## Audit Workflow

1. **Set the goal: speed or cost**
   - If the request already names the goal, use it.
   - If a person started the audit and can answer in this session, ask one question before reading any code: "Optimize for speed or for cost?" Wait for the answer.
   - If nobody can answer (the audit runs as a subagent, in CI, or in any other non-interactive session), detect it per package or file: `speed` for front-end code, which runs in a browser (components, DOM or browser APIs, a browser bundle target), and `cost` for everything else (servers, serverless handlers, jobs, CLIs, libraries).
   - `speed`: the gain is latency the user feels. A change may do more work on some path to finish sooner.
   - `cost`: the gain is work removed. A change that finishes sooner by doing more work on any path (an extra request, query, or computation) is not a finding.

2. **Scope the codebase and hot paths**
   - Identify entry points, request handlers, data transformation pipelines, loops, and shared utilities.
   - Prioritize code executed per request, per frame, or over large collections before touching cold startup code.

3. **Analyze allocations, loops, and data structures**
   - Scan for unnecessary array/object copies, chained array passes, and linear array scans.

4. **Evaluate caching and async execution**
   - Look for the same resource, result, or database query being fetched or computed repeatedly with the same inputs. These are memoization candidates to raise with the user, not changes to apply.
   - Check sequential `await` statements that always both run and can run concurrently, and `Promise.all` over inputs of unknown length that needs a concurrency cap.

5. **Audit dead code that is bundled or loaded**
   - Identify orphaned files and unused dependencies that still reach a bundle or are loaded at runtime. When terminal access is available, run Knip as described in `references/dead-code.md`.

6. **Report**
   - Present findings in the Output Format below, ranked by impact and risk.

7. **Apply and verify, one change at a time** (only when the user asks for edits)
   - Apply the findings in report order, one at a time.
   - Verify behaviour: tests, type check, and identical output for the same input. A change that skips validation, serves stale data, drops an `await`, or alters what callers receive is a regression, so revert it.
   - Keep every change that passes and removes work. Do not time a change to decide whether it is worth keeping: a gain too small to see on today's data is still free once the input grows.
   - Benchmark only when the user asks for numbers. Commands are in `references/verifying.md`.

## Optimization Rules

The numbers below were measured on Node 26.13 on one machine. They explain why a rule exists. A finding does not need its own measurement to be reported.

### Memory and Allocation Efficiency

- **Avoid unnecessary spread operators (`...`)**: Spreading arrays or objects inside loops or `.reduce()` (`[...acc, item]` or `{ ...acc, [k]: v }`) allocates a full copy on every step, turning O(n) work into O(n^2) time and memory. Mutate local structures created inside the function scope instead.
- **Collapse chained array pipelines**: Chaining `.filter().map().filter()` allocates an intermediate array at every stage. When the array's size comes from data, combine the steps into a single `for...of` loop. `flatMap()` is not a fix: it measured slower than `filter().map()`.
- **Avoid deep copies**: The deep copy is the cost, whichever API makes it. `structuredClone()` measured slower than `JSON.parse(JSON.stringify(x))` on plain data, and both block the event loop. Copy only the branches that change, with spread or `Object.assign`, and only when nothing mutates the branches the copy shares with the original. Never swap one deep-copy API for another: `structuredClone()` keeps `Date`, `Map`, `Set`, and `undefined` values that a JSON round-trip converts or drops, so the swap changes what callers receive.
- **Avoid `delete obj.prop` on hot objects**: Deleting a property moves the object out of V8's fast hidden-class shape into slow dictionary mode. Omit the property when the object is built instead. Setting it to `undefined` is not equivalent: `Object.keys` and `in` still see it, so it changes what callers receive.
- **Do not recommend object pooling or reuse**: V8 allocates and collects short-lived objects of one shape cheaply, so a pool often costs more than it saves, and shared mutable objects add risk.

### Loops and Data Structures

- **Do not flag `.forEach()` for speed**: With an inline callback it measured about the same as `for...of`. A callback only costs more when it escapes (stored, registered, or compared by identity).
- **Use `Map` and `Set` for auxiliary lookups**: Replace `array.includes()`, `array.indexOf()`, `array.find()`, or `array.some()` inside a loop or callback with `Set.has()` or `Map.get()`, turning O(n * m) work into O(n + m). Flag it whenever the array's size comes from data, however small it is today: at 20 items with the match found after about 10 checks, each lookup saves 9 comparisons at no risk. Skip only array literals with a handful of fixed items.
- **Deduplicate with `Set`**: Replace `arr.filter((v, i) => arr.indexOf(v) === i)` (O(n^2)) with `[...new Set(arr)]` (O(n)).
- **Find a minimum or maximum in one pass**: Sorting a copy to read its first or last element is O(n log n) and measured 270 times slower than a single loop over 100,000 numbers. `Math.max(...arr)` throws `RangeError` on large arrays, so use a loop there too.
- **Binary-search arrays that are already sorted**: `findIndex()` and `indexOf()` scan linearly. Use a binary search only when the code guarantees the sort order.

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

- **Parallelize independent `await` calls**: Replace sequential `const a = await fetchA(); const b = await fetchB();` with `const [a, b] = await Promise.all([fetchA(), fetchB()])` when operations do not depend on each other and every path that runs the first also runs the second. Inside a per-item loop, run that item's independent calls in parallel as well.
- **Under `cost`, do not start a call before the check that can skip it**: When a `throw`, `return`, `break`, or `continue` between two `await`s depends on the first result, the sequential code never pays for the second call on the failing path. `Promise.all` would send it on every path, which raises the bill for requests, queries, and metered APIs to save latency. Leave the code sequential and do not report it. Under `speed`, report it at `Medium` risk when the second call only reads, and say that it now runs on the failing path as well; a call that writes stays sequential under both goals.

  ```ts
  // Under `cost`, leave as is: getB() is never called, or paid for, when `a` is missing.
  const a = await getA();
  if (!a) throw new NotFoundError();

  const b = await getB();
  ```
- **Bound concurrency over inputs of unknown length**: `Promise.all(items.map(fn))` starts every call at once. With thousands of items it exhausts memory, sockets, file descriptors, or the database pool. Cap it with `p-map` (`{ concurrency: n }`) or `p-limit` when the project already depends on one. Otherwise process fixed-size chunks, or ask before adding the dependency.
- **Do not `await` values that are never promises in hot loops**: Each `await` yields to the microtask queue. Awaiting a plain value 10,000 times measured about 90 times slower than the same loop without it. Leave `return await` inside a `try` block alone, and do not remove `async` from a function other modules call: both change error handling.
- **Stream large payloads**: Avoid buffering multi-megabyte files or responses in memory with `readFile` or `.json()`. Process chunks incrementally with streams or `for await (const chunk of stream)`.
- **Clean up timers, listeners, and aborted requests**: Ensure `setInterval`, event listeners, and `AbortController` signals are disposed on teardown to prevent memory leaks.

### Bundle Size and Load Time

- **Remove dead code that ships**: Unreferenced files, unused dependencies, and branches behind obsolete feature flags add to the bundle or to startup. Check dynamic imports, framework entry points, and test files before deleting anything.
- **Avoid bloated barrel files (`index.ts`)**: Re-exporting entire directories via `export * from './...'` makes Node and test runners load every module at startup, and stops bundlers tree-shaking unused modules when the package does not declare `"sideEffects": false`. Import directly from concrete module paths.
- **Lazy-load heavy modules that most runs never use**: In CLIs, serverless handlers, and browser bundles, load a rarely used module with `await import('./report.js')` inside the branch that needs it, and load feature modules only when the feature is enabled. Write the path as a string literal so bundlers can resolve and split it; a computed path defeats that. Do not lazy-load on the request path of a long-running server: that moves the cost from startup to a user's first request.

## Output Format

Keep the report short: no introduction, no summary paragraph, no restating of the rules. Start with one line: `Goal: <speed|cost> (<asked|stated in the request|detected: front end|detected: not front end>)`.

1. **Findings**: one table, sorted by impact (`High` first) and, within the same impact, by risk (`None` first). The top row is the biggest gain for the least risk.

   | # | Impact | Risk | Where | Problem → fix |
   | --- | --- | --- | --- | --- |
   | 1 | High | None | `src/orders.ts:57` | `includes()` per order, O(n * m) → `Set`, O(n + m) |

   Under the table, one `### <#>. <title>` block per row, in the same order: at most two sentences (what the cost is and, for `Medium` risk, the open question), then a before and after snippet cut down to the lines that change. Leave the snippet out when the table row already shows the fix.

   **Impact**, by what the change removes:
   - `High`: work that grows with input size or repeats per request or item on a hot path: O(n^2) work, a query per item, a blocked event loop, unbounded memory or concurrency.
   - `Medium`: a constant cost repeated per item, call, or request: an allocation, a rebuilt `RegExp` or `Intl` object, an extra array pass.
   - `Low`: a cost paid once: startup time or bundle size.

   **Risk**, of the change altering behaviour:
   - `None`: same output for every input, and the change stays inside one function.
   - `Low`: same output, resting on a condition the code shows and a reviewer should check (sorted input, a map that never stores `undefined`), or the order of side effects changes (parallel `await`s).
   - `Medium`: depends on something the code does not show, such as data size, dynamic usage, or a downstream limit. Name what needs confirming.

   Describe each gain as the work removed (O(n * m) → O(n + m), one allocation fewer per item, N + 1 queries → 2), never as time.
2. **Dead code**: one line per unreferenced file or unused dependency that ships, with what to check before removing it (dynamic imports, entry points).
3. **Memoization candidates (confirmation required)**: a table of what is accessed repeatedly, the key, `max`, `ttl`, and invalidation, followed by one line asking which to apply.
4. **Coverage**: one line listing what was examined and found fine, one line listing what was not examined.

## Gotchas

- **Report only performance gains**: Every finding must make the code faster, use less memory, or ship less code. Never report style, readability, type-safety, naming, or API-hygiene changes, unused exports, types, or locals, or any change to what callers receive.
- **Do not dismiss a free win as too small**: A change that removes work at `None` or `Low` risk is reported, whatever its gain on today's data. Skip only code that runs once (startup, setup scripts) and collections fixed in the source at a handful of items.
- **Claim no timings that were not measured**: State a speedup, a percentage, or a duration only when it was measured in this audit. Otherwise describe the work removed.
- **Do not flag what the engine already optimizes**: V8 inlines non-escaping callbacks and identity wrappers, hoists loop-invariant conditions, and removes branches guarded by a constant. Rewriting them removes no work.
- **Respect public package boundaries**: In libraries or monorepo packages, verify `package.json` `exports` and `main` entry points before flagging a file as unreferenced.
- **Check memoization side effects**: Never memoize a function whose callers mutate the value it returns, or whose result depends on mutable state outside its arguments.

# Node Services: Event Loop and Data Access

Read this file when the audited code handles requests or jobs in Node: an HTTP server, a queue worker, or a serverless handler. Every check here can be made by reading the code. Report what they find as `High`.

## Event-loop blocking

One blocked event loop stalls every in-flight request, not only the one doing the work.

- **Flag synchronous APIs inside handlers and callbacks**: `fs.*Sync`, `crypto.pbkdf2Sync`, `crypto.scryptSync`, `zlib.*Sync`, `child_process.execSync`, and `child_process.spawnSync`. A single `pbkdf2Sync` call with 200,000 iterations measured a 68 ms stall. Use the async form. The same calls at module scope run once at startup and are fine.
- **Flag long synchronous work inside handlers**: loops over large collections, sorting large arrays, and `JSON.parse` or `JSON.stringify` on multi-megabyte payloads. Move the work to a `node:worker_threads` worker, stream it, or paginate the input.
- **Flag regular expressions with nested quantifiers applied to user input**: a pattern such as `/^(a+)+$/` took 1.2 seconds on a 29-character string that does not match, and the time grows exponentially with the length. Rewrite the pattern without nested repetition, or cap the input length before matching.
- **Flag unbounded parallel calls into the thread pool**: async `fs`, `crypto.pbkdf2`, `crypto.scrypt`, `zlib`, and `dns.lookup` share four threads by default. Four concurrent `pbkdf2` calls measured 73 ms in total; eight measured 139 ms, because the second four waited. Cap the concurrency (see "Bound concurrency" in `SKILL.md`). Raising `UV_THREADPOOL_SIZE` is a deployment setting: suggest it, do not change it.

To confirm a suspicion, run `node --trace-sync-io` or read `perf_hooks.monitorEventLoopDelay()`. Both are described in `references/verifying.md`.

## Data access

- **Flag a query or HTTP call per item (N+1)**: a database query or `fetch` inside a loop, or inside `.map(async ...)`, runs once per item. Replace it with one batched call: `WHERE id IN (...)`, a join, the ORM's eager loading, or a batch endpoint. Wrapping the per-item calls in `Promise.all` still sends one call per item.
- **Flag list queries with no limit**: `findMany()`, `find()`, or `SELECT` without a `LIMIT`, feeding an endpoint or job, grow with the table. Suggest a limit, a stable `ORDER BY`, and pagination. This changes what the endpoint returns, so mark it **Needs confirmation**.
- **Keep parallel queries at or below the connection pool size**: queries beyond the pool size wait for a free connection, so a larger `Promise.all` adds memory use and no speed.
- **Do not parallelize queries inside one transaction**: they share a single connection and run one at a time on it, so `Promise.all` gains nothing there.

Pool sizes and database connection limits are infrastructure settings. They are outside this audit unless the user asks.

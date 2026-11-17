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

## Examples

Each example shows code the skill flags and the fix it proposes. Most come from the seeded [`orders-service`](evals/cases/orders-service/src/orders.ts) eval fixture. Gains are described by complexity, or by the measurements recorded in the skill's [reference files](skills/js-ts-performance-audit/references/). Re-measure on your own workload before relying on a number.

### Query per item (N+1)

A database call inside a loop runs once per item, and a `Promise.all` around it still sends one call per item. The skill replaces it with one batched query. It reports this as `High`.

```ts
// Before: 1 + N queries
const orders = await db.orders.findMany({ where: { customerId } });
for (const order of orders) {
  order.items = await db.items.findMany({ where: { orderId: order.id } });
}
```

```ts
// After: 2 queries
const orders = await db.orders.findMany({ where: { customerId } });
const items = await db.items.findMany({
  where: { orderId: { in: orders.map((order) => order.id) } },
});

const itemsByOrder = new Map<string, Item[]>();
for (const item of items) {
  const list = itemsByOrder.get(item.orderId);
  if (list) list.push(item);
  else itemsByOrder.set(item.orderId, [item]);
}
for (const order of orders) {
  order.items = itemsByOrder.get(order.id) ?? [];
}
```

### Spread inside `reduce`

`{ ...acc }` copies every key collected so far on every step, so the work grows as O(n^2). The skill mutates a local accumulator instead.

```ts
// Before
const totals = orders.reduce(
  (acc, order) => ({ ...acc, [order.customerId]: (acc[order.customerId] ?? 0) + order.total }),
  {} as Record<string, number>,
);
```

```ts
// After
const totals: Record<string, number> = {};
for (const order of orders) {
  totals[order.customerId] = (totals[order.customerId] ?? 0) + order.total;
}
```

### Linear lookup inside a loop

`includes()` scans the whole array for every order: O(n * m). A `Set` makes each lookup O(1) on average.

```ts
// Before
const vip = orders.filter((order) => vipCustomerIds.includes(order.customerId));
```

```ts
// After
const vipIds = new Set(vipCustomerIds);
const vip = orders.filter((order) => vipIds.has(order.customerId));
```

### Blocking the event loop

One synchronous call in a request handler stalls every in-flight request. In the skill's measurement, a single `pbkdf2Sync` with 200,000 iterations blocked the loop for 68 ms. The example uses the fixture's 210,000. The same call at module scope runs once at startup and is left alone.

```ts
// Before
const hash = pbkdf2Sync(key, salt, 210_000, 32, 'sha256');
```

```ts
// After
import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

const hash = await pbkdf2Async(key, salt, 210_000, 32, 'sha256');
```

### Unbounded concurrency

`Promise.all(ids.map(...))` starts every call at once. With thousands of ids it can exhaust memory, sockets, or a database pool. The skill caps the concurrency with `p-map` or `p-limit` when the project already uses one. Otherwise it processes fixed-size chunks, or asks before adding a dependency.

```ts
// Before: one request per id, all at once
return Promise.all(orderIds.map((id) => fetchOrder(id)));
```

```ts
// After: at most 10 in flight
import pMap from 'p-map';

return pMap(orderIds, (id) => fetchOrder(id), { concurrency: 10 });
```

### Deep copies

The deep copy is the cost, whichever API makes it. The skill copies only the branches that change.

```ts
// Before
const next = JSON.parse(JSON.stringify(state));
next.settings.theme = 'dark';
```

```ts
// After
const next = { ...state, settings: { ...state.settings, theme: 'dark' } };
```

### Work rebuilt on every call

A `new Intl.NumberFormat(...)` or `new RegExp(...)` inside a function is rebuilt on every call. The skill hoists it to module scope so it is built once. It does the same for reads of files that never change, such as templates.

```ts
// Before
function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
```

```ts
// After
const priceFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatPrice(value: number) {
  return priceFormat.format(value);
}
```

### Dead code that ships

Unreferenced files and unused dependencies still reach the bundle or load at startup. When it can run code, the skill uses [Knip](https://knip.dev) to find them. Unused exports, types, and locals have no runtime cost, so it leaves them out. Everything Knip reports is a candidate: dynamic imports, framework entry points, and tests are checked before anything is deleted.

```diff
  // package.json
  "dependencies": {
-   "moment": "^2.30.1",
    "express": "^5.1.0"
  }
```

```diff
- src/legacy/discounts.ts   (imported by nothing, not a package entry point)
```

### Caching: a question, not an edit

The skill never adds a cache on its own. Here `listOrders` fetches an exchange rate once per order, usually for a handful of currencies. The report raises it as a candidate and asks:

```md
### Memoization Candidates (confirmation required)

| What                             | Key        | max | ttl   | Invalidation                                         |
| -------------------------------- | ---------- | --- | ----- | ---------------------------------------------------- |
| `fetchRate` call in `listOrders` | `currency` | 50  | 5 min | Expires by ttl. A rate can be up to 5 minutes stale. |

Which candidates should I apply?
```

Only after you approve does it add a bounded `lru-cache`. Concurrent calls for the same key share one request:

```ts
import { LRUCache } from 'lru-cache';

const rates = new LRUCache<string, number>({
  max: 50,
  ttl: 5 * 60_000,
  fetchMethod: (currency) => fetchRate(currency, 'USD'),
});

const rate = (await rates.fetch(order.currency))!;
```

### What a report looks like

Findings are grouped into `High`, `Medium`, and `Low`, and each one carries its evidence. This excerpt is illustrative:

```md
## Findings

### High: one query per order (N+1)

`src/orders.ts:35-37`

`listOrders` runs `db.items.findMany` once per order. The cost grows with the
number of orders and repeats on every request. Batch it with `WHERE orderId IN (...)`.

- **Evidence:** `static suspicion` (nothing was run)
- **Needs confirmation:** typical number of orders per customer

(before and after snippets)

## Coverage

Examined: `listOrders`, `totalsByCustomer`, `vipOrders`, `exportOrders`.
Not examined: `db` and `fetchRate`, which are imported but not in `src/`.
```

## Repository layout

- `skills/js-ts-performance-audit/SKILL.md`: the skill itself: audit workflow, optimization rules, and report format.
- `skills/js-ts-performance-audit/references/`: files the skill reads only when they apply.
  - `node-services.md`: event-loop blocking and data-access checks for Node servers and workers.
  - `hot-path-rules.md`: micro-rules for functions a profile shows are hot, each with its measured gain.
  - `verifying.md`: how to measure a change, and the profiling commands to use.
  - `dead-code.md`: running and configuring Knip.
- `evals/`: trigger and quality tests for the skill. See [evals/README.md](evals/README.md).
- `install.sh`: the installer. It copies the whole skill directory.

## License

See [LICENSE](LICENSE).

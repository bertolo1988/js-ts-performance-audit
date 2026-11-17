# Verifying Findings

Use this file only when the user asks for timings or a profile, or when nothing in the code shows where time goes. A finding never needs a measurement to be reported or kept. Every command below ships with Node; none adds a dependency to the audited project.

## Measuring a change

1. **Pick a representative workload**: a real request, a real input file, or a test fixture at production size. A toy input hides O(n^2) costs.
2. **Measure the unchanged code twice.** The difference between the two runs is the noise. A change must beat it.
3. **Warm up before timing steady state.** Run the workload until timings stop falling, then measure. Measure cold start separately, as the wall time of a fresh process.
4. **Consume every result.** Add each result into a variable that is printed at the end. Work whose result is unused can be removed by the engine, which makes the benchmark report a speed the real code never reaches.
5. **Compare two versions in fresh processes, in alternating order** (A, B, B, A). Running both in one process lets the first one's warm-up and garbage affect the second.
6. **Report what was measured**, and revert a change only when its behaviour differs or it measured slower than the noise.

## Which tool answers which question

| Question | Command | Reading the result |
| --- | --- | --- |
| Where does CPU time go? | `node --cpu-prof --cpu-prof-dir=./prof app.js` | Writes a `.cpuprofile` file. Summarize it with the script below, or open it in Chrome DevTools or VS Code. |
| Where does CPU time go, including Node internals? | `node --prof app.js`, then `node --prof-process isolate-*.log` | Prints a text table of ticks per function and per built-in. |
| What allocates the most? | `node --heap-prof app.js` | Writes a `.heapprofile` file of allocations by call site. |
| Is memory leaking? | `node --heapsnapshot-signal=SIGUSR2 app.js`, then `kill -USR2 <pid>` before and after the workload | Compare the two snapshots. Objects whose count grows between them, and never falls, are the leak. One snapshot alone proves nothing. |
| Is garbage collection the cost? | `node --trace-gc app.js` | Frequent scavenges mean allocation pressure; long mark-compact pauses mean a large live heap. |
| Is synchronous I/O running after startup? | `node --trace-sync-io app.js` | Prints a stack trace for each sync call made after the first event-loop turn. |
| How long is the event loop blocked? | `perf_hooks.monitorEventLoopDelay()` | The `max` and `percentile(99)` values, in nanoseconds, are the longest stalls. |
| Is a function being deoptimized? | `node --trace-opt --trace-deopt app.js` | Treat a deopt as real only when the same function deoptimizes again across runs. A single deopt during warm-up is normal. |

Delete the `prof/` directory, `isolate-*.log`, and snapshot files afterwards. They do not belong in the audited repository.

## Summarizing a CPU profile without a GUI

Save as a file outside the audited repository and run `node top.mjs prof/<file>.cpuprofile`. It prints the five functions with the most self time.

```js
import fs from 'node:fs';

const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const selfTime = new Map();

profile.samples.forEach((id, i) => {
  const { functionName, url, lineNumber } = nodes.get(id).callFrame;
  const key = `${functionName || '(anonymous)'} ${url.split('/').pop()}:${lineNumber + 1}`;
  selfTime.set(key, (selfTime.get(key) ?? 0) + profile.timeDeltas[i]);
});

const total = profile.timeDeltas.reduce((sum, delta) => sum + delta, 0);
for (const [key, micros] of [...selfTime].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`${(micros / 1000).toFixed(1)} ms  ${((micros / total) * 100).toFixed(1)}%  ${key}`);
}
```

## Benchmarking two versions of one function

Use `mitata` when the project already depends on it, or install it in a scratch directory outside the repository. Ask before adding it to the project. `do_not_optimize` keeps the engine from deleting the work being measured.

```js
import { bench, run, do_not_optimize } from 'mitata';

bench('filter + map', () => do_not_optimize(items.filter(isActive).map(toRow)));
bench('single loop', () => {
  const rows = [];
  for (const item of items) if (isActive(item)) rows.push(toRow(item));
  do_not_optimize(rows);
});

await run();
```

A micro-benchmark shows which version is faster in isolation. Confirm the gain on the representative workload before keeping the change.

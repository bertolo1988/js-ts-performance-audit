# Hot-Path Rules

Apply these rules only to a function that a CPU profile or benchmark shows is hot. Elsewhere they cost readability and return nothing measurable.

The ratios were measured on Node 26.13 on one machine. They show which direction is faster and roughly by how much. V8 changes between versions, so re-measure on the project's own workload before keeping a change.

## Rules that measured faster

| Flag this in a hot function | Replace with | Measured |
| --- | --- | --- |
| Throwing and catching for an expected outcome, such as "not found" or "invalid input" | Return a sentinel value or a result object | 446 times faster at a 50% miss rate |
| `try { fs.statSync(path) } catch {}` to test for a missing file | `fs.statSync(path, { throwIfNoEntry: false })` | 4.8 times faster |
| Reading properties through a `Proxy` | A plain object, or unwrap the target once before the loop | 89 times faster |
| A generator whose caller consumes every value | Build and return an array | 3.6 times faster |
| One function reading the same property from objects of many shapes (eight in the test) | Create those objects with the same properties in the same order | 2.7 times faster |
| An array that mixes value types, such as numbers and strings | Keep the array to one type | 3.2 times faster |
| A regular expression tested against one character at a time | Compare `charCodeAt(i)` against a range | 6.7 times faster |
| `line.split(sep)[0]` to read one field | `line.slice(0, line.indexOf(sep))` | 7.4 times faster |
| Building a substring one character at a time with `+=` | Track the start and end, then call `substring()` once | 300 times faster |
| A regular expression run on lines that mostly do not match | Test `line.includes(literal)` first and skip the miss | 1.4 times faster at a 5% match rate |
| A string built inside a callback from values that do not change per item | Build it once before the loop | 1.25 times faster |
| `map.has(key)` followed by `map.get(key)` | One `map.get(key)`, then test the result | 1.24 times faster |
| Comparing two arrays element by element | Compare `length` first and stop when it differs | Skips the whole pass |

Conditions on three of the rows:

- **Object shapes**: four shapes showed no difference. The cost appears when one call site sees many shapes, so check how many shapes reach the function before changing how objects are built.
- **`split()`**: keep it when the code uses every part.
- **Single `map.get()`**: valid only when the map never stores `undefined` as a value.

## Rules that measured no gain

Do not flag these. Each is a common recommendation that showed no difference, or a loss, when measured.

| Recommendation | Measured |
| --- | --- |
| Rest parameters instead of `arguments` | 1.06 times: within noise |
| Keeping `try` blocks out of hot loops, when nothing throws | No difference |
| Passing every declared argument at each call site | No difference |
| A packed array instead of `new Array(n)` filled by index | No difference when read |
| Copying a deep property read into a local before a loop | No difference |
| `Float64Array` instead of an array of numbers, for reads | No difference |
| Always-present properties set to `undefined` instead of conditional properties, with four shapes | 1.03 times: within noise |
| `toSorted()` instead of copying then sorting | 1.04 times: within noise. It is a readability choice. |
| `flatMap()` instead of `filter().map()` | Slower, at 0.89 times |
| A shared `Intl.Collator` instead of `localeCompare()` | Slower on ASCII strings, at 0.46 times; 1.3 times faster on non-ASCII strings. Measure with the project's real data. |

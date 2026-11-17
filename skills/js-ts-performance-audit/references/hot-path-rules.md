# Hot-Path Rules

Apply these rules to code that runs per item, per request, or inside a loop. No profile is needed: each one removes work, so flag it wherever that code runs, however small the gain looks today. Report each as `Medium` impact with the risk in its row, unless the surrounding loop makes it `High`.

The ratios were measured on Node 26.13 on one machine. They show which direction is faster and roughly by how much; do not re-measure them to decide whether to report a finding.

## Rules that measured faster

| Flag this | Replace with | Risk | Measured |
| --- | --- | --- | --- |
| Throwing and catching for an expected outcome, such as "not found" or "invalid input" | Return a sentinel value or a result object | `Low`, and only when every caller is in the same module | 446 times faster at a 50% miss rate |
| `try { fs.statSync(path) } catch {}` to test for a missing file | `fs.statSync(path, { throwIfNoEntry: false })` | `None` | 4.8 times faster |
| Reading properties through a `Proxy` | A plain object, or unwrap the target once before the loop | `Low`: check the traps have no side effects | 89 times faster |
| A generator whose caller consumes every value | Build and return an array | `Low` | 3.6 times faster |
| One function reading the same property from objects of many shapes (eight in the test) | Create those objects with the same properties in the same order | `Low` | 2.7 times faster |
| An array that mixes value types, such as numbers and strings | Keep the array to one type | `Low` | 3.2 times faster |
| A regular expression tested against one character at a time | Compare `charCodeAt(i)` against a range | `None` | 6.7 times faster |
| `line.split(sep)[0]` to read one field | `line.slice(0, line.indexOf(sep))`, keeping the whole line when `indexOf` returns `-1` | `Low` | 7.4 times faster |
| Building a substring one character at a time with `+=` | Track the start and end, then call `substring()` once | `None` | 300 times faster |
| A regular expression run on lines that mostly do not match | Test `line.includes(literal)` first and skip the miss | `None` when every match contains the literal | 1.4 times faster at a 5% match rate |
| A string built inside a callback from values that do not change per item | Build it once before the loop | `None` | 1.25 times faster |
| `map.has(key)` followed by `map.get(key)` | One `map.get(key)`, then test the result | `Low` | 1.24 times faster |
| Comparing two arrays element by element | Compare `length` first and stop when it differs | `None` | Skips the whole pass |

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

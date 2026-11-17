# Eval Results

Add a row per run to the table of the case you ran. Generated reports are not committed.

## Quality: `orders-service`

### 2026-11-17, Sonnet subagents, two runs per arm

| Arm | Found (of 5) | Banned claims (of 4) | Format (of 4) | Tokens per run |
| --- | --- | --- | --- | --- |
| No skill | 5, 5 | 1, 1 | 2, 2 | 67k, 65k |
| Skill at `f90583e` | 5, 5 | 3, 3 | 2, 2 | 76k, 74k |
| Skill at `f26b3aa` (#22) | 5, 5 | 0, 0 | 4, 4 | 89k, 87k |

These runs used the old `evidence-label` format check, since replaced by `ranked-table`. Format scores from later runs are not comparable with these.

Two runs per arm show a direction, not a rate. Every line the grader counted as a banned claim was read and is a real instance.

What the numbers say:

- **The skill does not help find problems.** Without it, the model found all five seeded problems in both runs, and ran its own benchmarks.
- **The skill at `f90583e` made reports worse.** Both runs recommended `structuredClone()` as the fix for the JSON round-trip and flagged `forEach` as a closure cost. Neither claim appeared without the skill, where both runs measured `structuredClone()` and found it slower.
- **The new skill removes those claims and the credential cache.** Every no-skill and `f90583e` run proposed caching API key verification. Both new-skill runs raised the exchange-rate cache as a question and listed key verification as excluded.
- **The new skill costs more.** About a third more tokens than no skill, from reading the reference files and following the report format.

Not covered by the grader, seen when reading the reports:

- **Tier inflation.** Both new-skill reports rated seven of eight findings `High`, including `includes()` in `vipOrders` with a note that it needs confirmation. The tier definition in `SKILL.md` puts anything that grows with input size in `High`. A tighter definition is a candidate change, to be tested with a new grader check.
- **The `evidence-label` check is loose.** The no-skill runs pass it because the word "measured" appears in their prose, not because each finding carries a label.

## Trigger

Not run yet. The cases are in [trigger.json](trigger.json).

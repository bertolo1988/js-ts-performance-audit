# Evals

Two kinds of test for the skill:

- **Trigger tests** check that the skill loads for the requests it should, and stays out of the ones it should not.
- **Quality tests** check that an audit made with the skill is better than one made without it.

Nothing here runs a model for you. Every run is a paid model call, so the prompts, fixtures, and grader are committed and you start the runs yourself. Generated reports are not committed; only the numbers in [RESULTS.md](RESULTS.md) are.

Re-run both after every change to `SKILL.md` or a reference file, and add a row to `RESULTS.md`.

## Trigger tests

[trigger.json](trigger.json) holds 15 prompts: 7 that should load the skill and 8 near misses that should not.

1. Install the skill (see the repository README).
2. For each prompt, start a fresh session and send the prompt unchanged.
3. Record whether the skill was loaded.
4. Compare with `should_trigger`. The `note` on each case says what it is testing.

A near miss that loads the skill points at the `description` in `SKILL.md`, because that is the only text the agent sees when deciding.

## Quality tests

Each case is a directory under [cases/](cases/):

- `src/`: the code to audit, seeded with known problems and with decoys that should not be flagged.
- `prompt.md`: the request to give the agent.
- `expectations.json`: what the grader checks.

To run a case:

1. Copy the case's `src/` into an empty scratch directory outside this repository, so the agent cannot read `expectations.json`.
2. Run the prompt there three ways: with no skill, with the skill from `main`, and with the skill from your branch. Tell the two skill runs where the skill directory is. Run each at least twice; one sample is not a result.
3. Grade each report:

   ```bash
   node evals/grade.mjs evals/cases/orders-service path/to/report.md
   ```

The grader prints three scores:

| Score | Meaning |
| --- | --- |
| `found` | Seeded problems the report identified. |
| `banned claims` | Decoys the report flagged, or performance claims that measurement contradicts. Lower is better. |
| `format` | Report elements the skill requires: evidence labels, tiers, a coverage section, and memoization raised as a question. A run without the skill is expected to score low here. |

The grader uses regular expressions only, so it is deterministic and it is approximate. It cannot tell a claim from a quotation of one. It prints every line that counted as a banned claim: read each of them before trusting the number.

### The `orders-service` case

| Seeded problem | Where |
| --- | --- |
| One query per order (N+1) | `listOrders` |
| `pbkdf2Sync` on every request | `verifyApiKey` |
| Spread of the accumulator inside `reduce` | `totalsByCustomer` |
| `includes()` inside `filter()` | `vipOrders` |
| `Promise.all` over a request-supplied list with no cap | `exportOrders` |
| The same exchange rate fetched for every order (a memoization candidate) | `listOrders` |

| Decoy | Why it is not a finding |
| --- | --- |
| `readFileSync`, `forEach`, and a spread in `loadConfig` | It runs once at startup, over three items. |
| `JSON.parse(JSON.stringify(order))` in `snapshot` | Replacing it with `structuredClone()` is not a speedup. |
| `forEach` in `countItems` | It measures about the same as `for...of`. |
| The account lookup and `verifyApiKey` result, as things to cache | They are permission data, which must be read live. |

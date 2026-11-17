#!/usr/bin/env node
// Grades one audit report against a case's expectations with regular expressions only.
// Usage: node evals/grade.mjs evals/cases/<case> <report.md> [--json]
import fs from 'node:fs';
import path from 'node:path';

const [caseDir, reportPath, flag] = process.argv.slice(2);
if (!caseDir || !reportPath) {
  console.error('Usage: node evals/grade.mjs <case-dir> <report.md> [--json]');
  process.exit(2);
}

const expectations = JSON.parse(fs.readFileSync(path.join(caseDir, 'expectations.json'), 'utf8'));
const report = fs.readFileSync(reportPath, 'utf8');
const lines = report.split('\n');
const NEAR_WINDOW = 800; // characters between the two patterns of a `near` check

const re = (source, flags = 'im') => new RegExp(source, flags);

// True when a match of `a` has a match of `b` within NEAR_WINDOW characters, in either order.
function near([a, b]) {
  const bMatches = [...report.matchAll(re(b, 'gim'))].map((match) => match.index);
  return [...report.matchAll(re(a, 'gim'))].some((match) =>
    bMatches.some((index) => Math.abs(index - match.index) <= NEAR_WINDOW),
  );
}

const mustFind = expectations.must_find.map((check) => ({ id: check.id, pass: near(check.near) }));

const banned = expectations.banned_claims.map((check) => {
  const hits = lines.filter(
    (line) =>
      check.line_all.every((source) => re(source, 'i').test(line)) &&
      check.line_any.some((source) => re(source, 'i').test(line)) &&
      !check.line_none.some((source) => re(source, 'i').test(line)),
  );
  return { id: check.id, pass: hits.length === 0, hits };
});

const format = expectations.format.map((check) => ({
  id: check.id,
  pass: check.all.every((source) => re(source).test(report)),
}));

const count = (checks) => checks.filter((check) => check.pass).length;
const summary = {
  found: `${count(mustFind)}/${mustFind.length}`,
  bannedClaims: banned.length - count(banned),
  format: `${count(format)}/${format.length}`,
};

if (flag === '--json') {
  console.log(JSON.stringify({ summary, mustFind, banned, format }));
} else {
  const mark = (pass) => (pass ? 'PASS' : 'FAIL');
  console.log(`found ${summary.found} | banned claims ${summary.bannedClaims} | format ${summary.format}`);
  for (const check of mustFind) console.log(`  ${mark(check.pass)} find    ${check.id}`);
  for (const check of banned) {
    console.log(`  ${mark(check.pass)} banned  ${check.id}`);
    // Print the matching lines: a regular expression cannot tell a claim from a quotation, so read each one.
    for (const hit of check.hits) console.log(`         > ${hit.trim().slice(0, 160)}`);
  }
  for (const check of format) console.log(`  ${mark(check.pass)} format  ${check.id}`);
}

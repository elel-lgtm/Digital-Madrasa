#!/usr/bin/env node
/**
 * Summarises a usability study recorded with docs/usability-test-kit.md.
 *
 *   node scripts/usability-score.mjs usability-results.csv
 *
 * Per task: completion rate (help counts as not completed unaided) and median
 * time. Per role: mean System Usability Scale score (Brooke, 1996) with its
 * adjective rating (Bangor, Kortum & Miller, 2009). Nothing is estimated: a
 * figure is printed only from rows that were actually recorded.
 */
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/usability-score.mjs <results.csv>');
  process.exit(1);
}

const [header, ...lines] = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const cols = header.split(',').map((c) => c.trim());
const rows = lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v.trim()])));

/** SUS: odd items score (answer - 1), even items (5 - answer); sum x 2.5. */
export function susScore(answers) {
  if (answers.length !== 10 || answers.some((a) => !(a >= 1 && a <= 5))) return null;
  const sum = answers.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

const adjective = (s) =>
  s >= 85 ? 'excellent' : s >= 73 ? 'good' : s >= 52 ? 'OK' : s >= 39 ? 'poor' : 'awful';
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length === 0 ? null : v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

console.log('Tasks');
for (const task of [...new Set(rows.map((r) => r.task).filter(Boolean))].sort()) {
  const done = rows.filter((r) => r.task === task);
  const unaided = done.filter((r) => r.completed === 'yes').length;
  const times = done.map((r) => Number(r.seconds)).filter((n) => Number.isFinite(n) && n > 0);
  console.log(`  ${task}  ${done[0].role.padEnd(8)} completion ${unaided}/${done.length} (${Math.round((unaided / done.length) * 100)}%)` +
    `  median time ${median(times) ?? '—'} s  errors ${done.reduce((s, r) => s + (Number(r.errors) || 0), 0)}`);
}

console.log('\nSUS by role');
const scores = [];
for (const role of [...new Set(rows.map((r) => r.role).filter(Boolean))]) {
  const people = new Map();
  for (const r of rows.filter((x) => x.role === role)) {
    const answers = Array.from({ length: 10 }, (_, i) => Number(r[`sus${i + 1}`]));
    const s = susScore(answers);
    if (s !== null) people.set(r.participant, s);
  }
  const list = [...people.values()];
  scores.push(...list);
  if (list.length === 0) {
    console.log(`  ${role.padEnd(8)} no complete SUS forms`);
    continue;
  }
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  console.log(`  ${role.padEnd(8)} n=${list.length}  mean SUS ${mean.toFixed(1)} (${adjective(mean)})`);
}
if (scores.length > 0) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(`  overall  n=${scores.length}  mean SUS ${mean.toFixed(1)} (${adjective(mean)})`);
}

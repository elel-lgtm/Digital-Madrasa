#!/usr/bin/env node
/**
 * Guards the translation files against the two ways they have actually broken.
 *
 *   npm run check:i18n
 *
 * The first is a namespace being replaced rather than added to. A script that
 * assigned `data.billing = {...}` silently deleted fifty-eight subscription
 * strings, and nothing noticed until a device showed `billing.trialTitle` where
 * the trial banner should have been.
 *
 * That is caught here by turning the usual direction of the check around. The
 * obvious rule -- every English key must be translated everywhere -- is useless
 * in this project, because coverage outside English is genuinely partial and the
 * check would fail permanently and then be switched off. The useful rule is the
 * reverse: any key a translation defines, English must define too. English is
 * the fallback every locale resolves through, so it can only ever be a superset.
 * If English loses a namespace the translations still carry, that is not partial
 * coverage -- it is a deletion, and it fails.
 *
 * The second is a key the code asks for that English does not define. i18next
 * then prints the key itself, which reads as a broken screen.
 *
 * Coverage is reported but never failed on.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LOCALE_DIR = 'apps/mobile/src/i18n/locales';
const SOURCE_DIRS = ['apps/mobile/app', 'apps/mobile/src'];
const BASE = 'en';

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  );
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
}

const locales = readdirSync(LOCALE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const loaded = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(readFileSync(join(LOCALE_DIR, `${l}.json`), 'utf8'))]),
);

const failures = [];

const baseNamespaces = Object.keys(loaded[BASE]);
const known = new Set(flatten(loaded[BASE]).map(([k]) => k));

// Plural forms. English needs only `_one`/`_other`, but a language may need
// more of the CLDR categories — Arabic uses all six — and i18next picks the
// form by the locale's own rules. A translation's `_few` is therefore not an
// orphan as long as English defines the same base key in some form.
const PLURAL = /_(zero|one|two|few|many|other)$/;
const isKnown = (k) => {
  if (known.has(k)) return true;
  const base = k.replace(PLURAL, '');
  return base !== k && (known.has(base) || known.has(`${base}_other`) || known.has(`${base}_one`));
};

// ------------------------------------------- English must remain a superset
for (const locale of locales.filter((l) => l !== BASE)) {
  const orphans = flatten(loaded[locale])
    .map(([k]) => k)
    .filter((k) => !isKnown(k));
  if (orphans.length) {
    const namespaces = [...new Set(orphans.map((k) => k.split('.')[0]))];
    failures.push(
      `${locale}.json defines ${orphans.length} key(s) ${BASE}.json does not ` +
        `(namespaces: ${namespaces.join(', ')}) -- ${BASE} has lost strings, ` +
        `e.g. "${orphans[0]}"`,
    );
  }
}

// ------------------------------------------------- every used key must exist
const used = new Map();
for (const dir of SOURCE_DIRS) {
  for (const file of walk(dir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'/g)) {
      if (!used.has(match[1])) used.set(match[1], file);
    }
  }
}

for (const [key, file] of used) {
  // i18next resolves `key` for the singular and `key_other` for the plural, so
  // a key defined only in its plural forms is still present.
  if (known.has(key) || known.has(`${key}_other`)) continue;
  failures.push(`${file} uses "${key}", which ${BASE}.json does not define`);
}

if (failures.length) {
  console.error('\n✗ Translation files need attention:\n');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log(
  `\n✓ Translations are consistent — ${locales.length} locales, ` +
    `${baseNamespaces.length} namespaces, ${used.size} keys referenced in code.`,
);
console.log('  coverage (informational, partial by design):');
for (const locale of locales) {
  // Only keys English defines count, so extra plural forms cannot pass 100%.
  const count = flatten(loaded[locale]).filter(([k]) => known.has(k)).length;
  const pct = Math.round((count / known.size) * 100);
  console.log(`    ${locale.padEnd(4)} ${String(count).padStart(4)} / ${known.size}  ${pct}%`);
}

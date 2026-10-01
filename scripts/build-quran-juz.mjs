#!/usr/bin/env node
/**
 * Splits the Uthmani Quran text into one file per juz for the offline library.
 *
 *   node scripts/build-quran-juz.mjs <path/to/quran-json/dist/quran.json>
 *
 * Source: quran-json 3.1.2 (CC-BY-4.0), whose Arabic text is the Uthmani
 * script of The Noble Qur'an Encyclopedia (quranenc.com). The text is copied
 * verbatim; only the grouping into juz is ours.
 *
 * Writes supabase/seed/quran/juz-NN.json and manifest.json. The juz
 * boundaries are the same as packages/shared/src/hifz.ts (JUZ_START), and the
 * script refuses to write anything unless all 6,236 ayahs are accounted for
 * exactly once.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('usage: node scripts/build-quran-juz.mjs <quran.json>');
  process.exit(1);
}

// Keep in step with JUZ_START in packages/shared/src/hifz.ts.
const JUZ_START = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 83], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

const quran = JSON.parse(readFileSync(source, 'utf8'));
const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
const juzOf = (s, a) => {
  let juz = 1;
  JUZ_START.forEach((start, i) => {
    if (!before([s, a], start)) juz = i + 1;
  });
  return juz;
};

const books = Array.from({ length: 30 }, (_, i) => ({ juz: i + 1, surahs: [] }));
let total = 0;
for (const surah of quran) {
  for (const verse of surah.verses) {
    const book = books[juzOf(surah.id, verse.id) - 1];
    let entry = book.surahs[book.surahs.length - 1];
    if (!entry || entry.number !== surah.id) {
      entry = { number: surah.id, name: surah.name, transliteration: surah.transliteration, ayahs: [] };
      book.surahs.push(entry);
    }
    entry.ayahs.push({ n: verse.id, text: verse.text });
    total += 1;
  }
}
if (total !== 6236) throw new Error(`expected 6236 ayahs, found ${total}`);

const outDir = 'supabase/seed/quran';
mkdirSync(outDir, { recursive: true });
const manifest = {
  version: 1,
  text: 'Uthmani script, The Noble Qur\'an Encyclopedia (quranenc.com), via quran-json 3.1.2',
  license: 'CC-BY-4.0',
  juz: [],
};
for (const book of books) {
  const body = JSON.stringify({ juz: book.juz, surahs: book.surahs });
  const file = `juz-${String(book.juz).padStart(2, '0')}.json`;
  writeFileSync(`${outDir}/${file}`, body);
  const ayahs = book.surahs.reduce((n, s) => n + s.ayahs.length, 0);
  const first = book.surahs[0];
  const last = book.surahs[book.surahs.length - 1];
  manifest.juz.push({
    juz: book.juz,
    file,
    ayahs,
    bytes: Buffer.byteLength(body),
    sha256: createHash('sha256').update(body).digest('hex'),
    from: [first.number, first.ayahs[0].n],
    to: [last.number, last.ayahs[last.ayahs.length - 1].n],
  });
}
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const sum = manifest.juz.reduce((n, j) => n + j.ayahs, 0);
console.log(`  wrote 30 juz files (${sum} ayahs) and manifest.json to ${outDir}`);

/**
 * Recite-along: follow a pupil word by word while they recite, from what a
 * speech recogniser hears.
 *
 * The mushaf is in Uthmani script and recognisers write modern spelling, so
 * the same word can look different: ٱلصِّرَٰطَ against الصراط, كُفُوًا
 * against كفوا. Words are compared on a skeleton: no vowel marks, one form of
 * each letter, and no long-vowel letters, which is where the two spellings
 * differ. Longer words may differ by one more letter, since recognisers slip.
 *
 * This is practice, not assessment: a word shown as missed may simply not
 * have been heard. Marking stays with the teacher and the recorded
 * recitation.
 */

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Plain Arabic letters, one form of each: no harakat, Quranic marks or tatweel. */
export function normaliseArabic(word: string): string {
  return word
    .replace(MARKS, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^ء-ي]/g, '');
}

const skeleton = (word: string) => normaliseArabic(word).replace(/[اوي]/g, '');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length]!;
}

export function wordsMatch(expected: string, heard: string): boolean {
  const a = skeleton(expected);
  const b = skeleton(heard);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 3 && distance(a, b) <= 1;
}

export interface MushafWord {
  /** As printed, with any pause mark that follows it. */
  display: string;
  ayah: number;
}

/** Splits ayahs into words, keeping pause marks with the word before them. */
export function mushafWords(ayahs: readonly { n: number; text: string }[]): MushafWord[] {
  const words: MushafWord[] = [];
  for (const ayah of ayahs) {
    for (const token of ayah.text.split(/\s+/).filter(Boolean)) {
      const last = words[words.length - 1];
      if (!normaliseArabic(token) && last && last.ayah === ayah.n) last.display += ` ${token}`;
      else if (normaliseArabic(token)) words.push({ display: token, ayah: ayah.n });
    }
  }
  return words;
}

export type WordState = 'pending' | 'recited' | 'missed';

export interface Follow {
  states: WordState[];
  /** The next word expected. */
  cursor: number;
  done: boolean;
}

/**
 * Lines up what was heard with the words of the passage. Each heard word may
 * match one of the next few expected words (`lookahead`); any it jumps over
 * are marked missed. A heard word that matches nothing nearby is ignored, so
 * a cough, a repeated word or a misheard one does not lose the place.
 */
export function followRecitation(words: readonly MushafWord[], heard: string, lookahead = 3): Follow {
  const states: WordState[] = words.map(() => 'pending');
  let cursor = 0;
  for (const token of heard.split(/\s+/).filter((t) => normaliseArabic(t))) {
    const end = Math.min(words.length, cursor + lookahead + 1);
    for (let j = cursor; j < end; j += 1) {
      if (wordsMatch(words[j]!.display, token)) {
        for (let k = cursor; k < j; k += 1) states[k] = 'missed';
        states[j] = 'recited';
        cursor = j + 1;
        break;
      }
    }
    if (cursor >= words.length) break;
  }
  return { states, cursor, done: cursor >= words.length };
}

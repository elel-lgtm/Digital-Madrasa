/**
 * A child's progress as a few spoken sentences, for parents who would rather
 * listen than read. Built from the same records the child screen shows; the
 * Edge Function `voice-report` turns it into speech.
 *
 * Deliberately import-free: the Edge Function (Deno) imports this file
 * directly, as it does packages/shared/src/quran.ts.
 */

export const VOICE_LANGS = ['en', 'sw', 'so', 'ar'] as const;
export type VoiceLang = (typeof VOICE_LANGS)[number];

export interface VoiceReportFacts {
  childName: string;
  /** Sessions attended (present or late) in the last 30 days. */
  attended: number;
  /** Sessions held in that time, excused absences left out. */
  sessions: number;
  memorisedSurahs: number;
  learning: { surahName: string; ayah: number } | null;
  /** The latest assessed recitation's score, the teacher's if they gave one. */
  lastScore: number | null;
  teacherRemark: string | null;
  /** Fees still owed, in shillings. */
  balance: number;
}

type Phrases = {
  hello: string;
  attendance: (f: VoiceReportFacts) => string;
  noAttendance: string;
  memorised: (n: number) => string;
  learning: (surah: string, ayah: number) => string;
  score: (n: number) => string;
  remark: (r: string) => string;
  owes: (n: number) => string;
  paid: string;
  bye: string;
};

const money = (n: number) => Math.round(n).toLocaleString('en-US');

const PHRASES: Record<VoiceLang, Phrases> = {
  en: {
    hello: 'Assalamu alaikum. Here is the madrasa report for',
    attendance: (f) => `In the last thirty days, ${f.childName} came to ${f.attended} of ${f.sessions} classes.`,
    noAttendance: 'No classes have been recorded in the last thirty days.',
    memorised: (n) => (n === 1 ? 'So far, one surah has been memorised.' : `So far, ${n} surahs have been memorised.`),
    learning: (s, a) => `The surah being learned now is ${s}, up to ayah ${a}.`,
    score: (n) => `The latest recitation scored ${n} out of one hundred.`,
    remark: (r) => `The teacher says: ${r}`,
    owes: (n) => `The fees still owed are ${money(n)} shillings.`,
    paid: 'All fees are paid. Thank you.',
    bye: 'May Allah bless your family.',
  },
  sw: {
    hello: 'Assalamu alaikum. Hii ni ripoti ya madrasa ya',
    attendance: (f) => `Katika siku thelathini zilizopita, ${f.childName} alihudhuria vipindi ${f.attended} kati ya ${f.sessions}.`,
    noAttendance: 'Hakuna vipindi vilivyorekodiwa katika siku thelathini zilizopita.',
    memorised: (n) => (n === 1 ? 'Hadi sasa, amehifadhi sura moja.' : `Hadi sasa, amehifadhi sura ${n}.`),
    learning: (s, a) => `Sura anayojifunza sasa ni ${s}, hadi aya ya ${a}.`,
    score: (n) => `Kisomo cha mwisho kilipata alama ${n} kati ya mia.`,
    remark: (r) => `Mwalimu anasema: ${r}`,
    owes: (n) => `Ada iliyobaki ni shilingi ${money(n)}.`,
    paid: 'Ada yote imelipwa. Asante.',
    bye: 'Mwenyezi Mungu aibariki familia yako.',
  },
  so: {
    hello: 'Assalaamu calaykum. Kani waa warbixinta madrasada ee',
    attendance: (f) => `Soddonkii maalmood ee la soo dhaafay, ${f.childName} wuxuu yimid ${f.attended} ka mid ah ${f.sessions} fasal.`,
    noAttendance: 'Soddonkii maalmood ee la soo dhaafay fasal lama diiwaangelin.',
    memorised: (n) => (n === 1 ? 'Ilaa hadda, hal suurad ayuu xifdiyey.' : `Ilaa hadda, ${n} suuradood ayuu xifdiyey.`),
    learning: (s, a) => `Suuradda uu hadda baranayo waa ${s}, ilaa aayadda ${a}.`,
    score: (n) => `Akhriskii ugu dambeeyey wuxuu helay ${n} boqolkiiba.`,
    remark: (r) => `Macallinku wuxuu leeyahay: ${r}`,
    owes: (n) => `Lacagta waxbarashada ee hadhay waa ${money(n)} shilin.`,
    paid: 'Lacagta oo dhan waa la bixiyey. Mahadsanid.',
    bye: 'Alle ha barakeeyo qoyskaaga.',
  },
  ar: {
    hello: 'السلام عليكم. هذا تقرير المدرسة القرآنية عن',
    attendance: (f) => `في الثلاثين يومًا الماضية، حضر ${f.childName} ${f.attended} من ${f.sessions} حصة.`,
    noAttendance: 'لم تُسجَّل أي حصة في الثلاثين يومًا الماضية.',
    memorised: (n) => (n === 1 ? 'حتى الآن حفظ سورة واحدة.' : `حتى الآن حفظ ${n} سورة.`),
    learning: (s, a) => `السورة التي يتعلمها الآن هي سورة ${s}، حتى الآية ${a}.`,
    score: (n) => `حصلت آخر تلاوة على ${n} من مئة.`,
    remark: (r) => `يقول المعلم: ${r}`,
    owes: (n) => `الرسوم المتبقية ${money(n)} شلن.`,
    paid: 'تم دفع جميع الرسوم. شكرًا لكم.',
    bye: 'بارك الله في أسرتكم.',
  },
};

export function voiceReportText(f: VoiceReportFacts, lang: VoiceLang): string {
  const p = PHRASES[lang] ?? PHRASES.en;
  const lines = [`${p.hello} ${f.childName}.`];
  lines.push(f.sessions > 0 ? p.attendance(f) : p.noAttendance);
  lines.push(p.memorised(f.memorisedSurahs));
  if (f.learning) lines.push(p.learning(f.learning.surahName, f.learning.ayah));
  if (f.lastScore !== null) lines.push(p.score(Math.round(f.lastScore)));
  if (f.teacherRemark) lines.push(p.remark(f.teacherRemark.trim().slice(0, 200)));
  lines.push(f.balance > 0 ? p.owes(f.balance) : p.paid);
  lines.push(p.bye);
  return lines.join(' ');
}

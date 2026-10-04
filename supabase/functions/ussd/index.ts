import { adminClient } from '../_shared/auth.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';
import { getSurah } from '../../../packages/shared/src/quran.ts';

/**
 * USSD for parents on feature phones: dial the madrasa's code, pick a
 * language and a child, and read attendance, memorisation, fees or the
 * teacher's latest remark. No smartphone, data bundle or app needed.
 *
 * Africa's Talking POSTs (form-encoded) sessionId, serviceCode, phoneNumber
 * and `text`, the answers so far joined by '*'. We reply in plain text:
 * "CON …" keeps the session open for another answer, "END …" closes it.
 *
 * The callback URL registered with Africa's Talking carries a secret
 * (`?key=…`, the USSD_SECRET function secret); anything without it is
 * refused, so no one can ask about a number by calling us directly. Who may
 * see which child is decided in the database by ussd_children(), through
 * can_read_student(), the same rule the app uses.
 */

type Lang = 'en' | 'sw' | 'so';

interface Child {
  first_name: string;
  attended: number;
  sessions: number;
  memorised: number;
  learning_surah: number | null;
  learning_ayah: number | null;
  balance: number;
  last_score: number | null;
  remark: string | null;
}

const T: Record<Lang, {
  welcome: string; pick: string; menu: string[]; unknown: string; invalid: string; busy: string;
  attendance: (c: Child) => string; hifz: (c: Child) => string; fees: (c: Child) => string; remark: (c: Child) => string;
}> = {
  en: {
    welcome: 'Digital Madrasa', pick: 'Choose a child:',
    menu: ['Attendance', 'Hifz progress', 'Fees balance', 'Teacher\'s remark'],
    unknown: 'This number is not linked to any child. Ask the madrasa to add it to your parent account.',
    invalid: 'Invalid choice. Please dial again.', busy: 'Too many requests. Please try again later.',
    attendance: (c) => c.sessions === 0 ? `${c.first_name}: no classes recorded in the last 30 days.` : `${c.first_name} came to ${c.attended} of ${c.sessions} classes in the last 30 days.`,
    hifz: (c) => `${c.first_name} has memorised ${c.memorised} surah(s).` + (c.learning_surah ? ` Now learning ${surahName(c.learning_surah)}, ayah ${c.learning_ayah}.` : ''),
    fees: (c) => c.balance > 0 ? `Fees owed for ${c.first_name}: KES ${money(c.balance)}. Pay by M-Pesa from the app or at the madrasa.` : `All fees for ${c.first_name} are paid. Thank you.`,
    remark: (c) => c.remark ? `Teacher on ${c.first_name}'s last recitation${score(c)}: "${c.remark}"` : `No teacher's remark yet for ${c.first_name}.`,
  },
  sw: {
    welcome: 'Digital Madrasa', pick: 'Chagua mtoto:',
    menu: ['Mahudhurio', 'Maendeleo ya hifdhi', 'Salio la ada', 'Maoni ya mwalimu'],
    unknown: 'Nambari hii haijaunganishwa na mtoto yeyote. Omba madrasa iiongeze kwenye akaunti yako.',
    invalid: 'Chaguo si sahihi. Tafadhali piga tena.', busy: 'Maombi mengi mno. Jaribu tena baadaye.',
    attendance: (c) => c.sessions === 0 ? `${c.first_name}: hakuna vipindi vilivyorekodiwa siku 30 zilizopita.` : `${c.first_name} alihudhuria vipindi ${c.attended} kati ya ${c.sessions} siku 30 zilizopita.`,
    hifz: (c) => `${c.first_name} amehifadhi sura ${c.memorised}.` + (c.learning_surah ? ` Sasa anajifunza ${surahName(c.learning_surah)}, aya ${c.learning_ayah}.` : ''),
    fees: (c) => c.balance > 0 ? `Ada inayodaiwa kwa ${c.first_name}: KES ${money(c.balance)}. Lipa kwa M-Pesa kupitia programu au madrasa.` : `Ada yote ya ${c.first_name} imelipwa. Asante.`,
    remark: (c) => c.remark ? `Mwalimu kuhusu kisomo cha mwisho cha ${c.first_name}${score(c)}: "${c.remark}"` : `Bado hakuna maoni ya mwalimu kwa ${c.first_name}.`,
  },
  so: {
    welcome: 'Digital Madrasa', pick: 'Dooro ilmaha:',
    menu: ['Imaanshaha', 'Horumarka xifdiga', 'Lacagta hadhay', 'Faallada macallinka'],
    unknown: 'Lambarkan kuma xidhna ilmo. Madrasada ka codso inay ku darto koontadaada.',
    invalid: 'Doorasho khaldan. Fadlan mar kale garaac.', busy: 'Codsiyo badan. Fadlan mar dambe isku day.',
    attendance: (c) => c.sessions === 0 ? `${c.first_name}: fasal lama diiwaangelin 30kii maalmood ee la soo dhaafay.` : `${c.first_name} wuxuu yimid ${c.attended} ka mid ah ${c.sessions} fasal 30kii maalmood ee la soo dhaafay.`,
    hifz: (c) => `${c.first_name} wuxuu xifdiyey ${c.memorised} suuradood.` + (c.learning_surah ? ` Hadda wuxuu baranayaa ${surahName(c.learning_surah)}, aayadda ${c.learning_ayah}.` : ''),
    fees: (c) => c.balance > 0 ? `Lacagta lagu leeyahay ${c.first_name}: KES ${money(c.balance)}. Ku bixi M-Pesa abka ama madrasada.` : `Lacagta ${c.first_name} oo dhan waa la bixiyey. Mahadsanid.`,
    remark: (c) => c.remark ? `Macallinka, akhriskii ugu dambeeyey ee ${c.first_name}${score(c)}: "${c.remark}"` : `Weli faallo macallin ma jirto ${c.first_name}.`,
  },
};

const LANGS: Lang[] = ['en', 'sw', 'so'];
const money = (n: number) => Math.round(Number(n)).toLocaleString('en-US');
const surahName = (n: number) => getSurah(n)?.name ?? `Surah ${n}`;
const score = (c: Child) => (c.last_score !== null ? ` (${Math.round(Number(c.last_score))}/100)` : '');
/** Feature phones show about 160 characters; keep every screen inside that. */
const fit = (s: string) => (s.length > 170 ? `${s.slice(0, 167)}...` : s);

function reply(body: string): Response {
  return new Response(fit(body), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method !== 'POST' || !secretMatches(url.searchParams.get('key'), Deno.env.get('USSD_SECRET'))) {
    return new Response('Not found', { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const phone = String(form?.get('phoneNumber') ?? '');
  const text = String(form?.get('text') ?? '').trim();
  const answers = text === '' ? [] : text.split('*');

  // Step 1: language.
  if (answers.length === 0) {
    return reply('CON Digital Madrasa\n1. English\n2. Kiswahili\n3. Soomaali');
  }
  const lang = LANGS[Number(answers[0]) - 1];
  if (!lang) return reply(`END ${T.en.invalid}`);
  const t = T[lang];

  const admin = adminClient();
  try {
    await rateLimit(admin, `ussd:${phone.replace(/\D/g, '').slice(-9)}`, LIMITS.ussd);
  } catch {
    return reply(`END ${t.busy}`);
  }

  const { data, error } = await admin.rpc('ussd_children', { p_phone: phone });
  if (error) return reply(`END ${t.busy}`);
  const children = (data ?? []) as Child[];
  if (children.length === 0) return reply(`END ${t.unknown}`);

  // Step 2: which child, when there is more than one.
  let rest = answers.slice(1);
  let child = children[0]!;
  if (children.length > 1) {
    if (rest.length === 0) {
      return reply(`CON ${t.pick}\n${children.map((c, i) => `${i + 1}. ${c.first_name}`).join('\n')}`);
    }
    const picked = children[Number(rest[0]) - 1];
    if (!picked) return reply(`END ${t.invalid}`);
    child = picked;
    rest = rest.slice(1);
  }

  // Step 3: what to see.
  if (rest.length === 0) {
    return reply(`CON ${child.first_name}\n${t.menu.map((m, i) => `${i + 1}. ${m}`).join('\n')}`);
  }
  const answer = [t.attendance, t.hifz, t.fees, t.remark][Number(rest[0]) - 1];
  return reply(`END ${answer ? answer(child) : t.invalid}`);
});

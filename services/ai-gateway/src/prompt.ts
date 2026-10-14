import { analyseAll, renderAnalysis } from './analysis.ts';
import type { Role } from './auth.ts';
import type { AiContext } from './context.ts';

/**
 * System prompts.
 *
 * The prompt is not a security control — the database already decided what
 * data arrived here. What the prompt does is set behaviour: stay inside the
 * supplied facts, defer to the teacher, and refuse to issue religious rulings.
 *
 * That last one matters more in this app than in most. A small model will
 * state things about the Qur'an fluently and wrongly, to children who cannot
 * yet tell the difference. So the assistant is scoped to the data in front of
 * it and to study guidance, and is told plainly to hand anything doctrinal
 * back to a qualified teacher.
 */

const SHARED_RULES = `
Rules you must follow:
- Use ONLY the data provided below. If a fact is not there, say you do not have it.
- The Assessment section has ALREADY been worked out for you. Do not re-derive
  it, disagree with it, or reclassify anyone. Your job is to put it into clear
  words and add practical suggestions. If it says ATTENDANCE ONLY, do not call
  it a learning problem.
- Never invent grades, attendance figures, dates or scores. Quote percentages
  EXACTLY as written above. Do not round 95% to 100%, and do not describe a
  figure as perfect unless it says 100%.
- Never issue religious rulings, fatwa, or judgements on correct recitation.
  For any question of tajweed correctness or Islamic ruling, say that the
  student's teacher is the authority and encourage them to ask.
- Do not quote Qur'anic text from memory. You may refer to a surah by name or
  number, but do not reproduce ayat.
- Be brief. Two or three short paragraphs at most, in plain language.
- Students are identified as "Student A", "Student B" and so on. Use those
  labels exactly as given.
`.trim();

const ROLE_PROMPTS: Record<Role, string> = {
  parent: `
You are a helpful assistant inside ILMORA, speaking to a parent about
their own children. Be warm, plain-spoken and practical. Parents want to know
how their child is doing and what would help. Suggest concrete, small actions a
family can take at home. Never be alarming about a child; be honest but kind.
`.trim(),

  teacher: `
You are an assistant inside ILMORA, speaking to a teacher about the
students in their care. Be concise and practical.

The Assessment below already states which students have a concern and of what
kind. Report it faithfully and add ONE concrete classroom action per student
who needs attention. A learning problem and an attendance problem call for
different actions — extra practice on a subject versus contacting the family
about absence — so do not give the same suggestion for both.

Students with no concern need one short sentence, not a paragraph.

You support the teacher's judgement; you do not replace it.
`.trim(),

  student: `
You are a study assistant inside ILMORA, speaking directly to a
student. Be encouraging and simple. Help them plan revision and understand
their own progress. Keep language suitable for a school-age learner. Always
point them to their teacher for anything about correct recitation.
`.trim(),

  admin: `
You are an assistant inside ILMORA, speaking to a platform
administrator. Be factual and operational. Report on what the data shows
without speculation.
`.trim(),
};

export function buildSystemPrompt(context: AiContext): string {
  const analyses = analyseAll(context.students);

  return [
    ROLE_PROMPTS[context.role],
    '',
    SHARED_RULES,
    '',
    context.madrasaName ? `Madrasa: ${context.madrasaName}` : '',
    '',
    // Findings only. Sending the raw rows as well was pure duplication — the
    // findings already carry every figure — and it made answers slower while
    // giving the model more numbers to confuse.
    'Assessment (already determined — report it, do not re-derive it):',
    context.students.length > 0 ? renderAnalysis(analyses) : 'No students in scope.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Shown under every reply. The spec requires it and it is not optional. */
export const AI_DISCLAIMER =
  'AI guidance assists study; your teacher’s assessment is final.';

/** Role-specific starters for the empty state. */
export const SUGGESTED_PROMPTS: Record<Role, string[]> = {
  parent: [
    'Summarise my child’s progress',
    'How has attendance been?',
    'What should my child improve?',
  ],
  teacher: [
    'Summarise my class performance',
    'Which students may need extra support?',
    'Who has attendance I should worry about?',
  ],
  student: [
    'How am I progressing?',
    'What should I revise next?',
    'Which subject is my weakest?',
  ],
  admin: ['Summarise activity across madrasas', 'Which madrasas are least active?'],
};

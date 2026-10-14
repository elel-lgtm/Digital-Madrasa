/**
 * Front matter, laid out as in the reference report (Livestock Market and
 * VetCare): cover, declaration (student and supervisor on one page),
 * dedication, acknowledgement and abstract. The four front-matter headings are
 * level-1 headings so the table of contents lists them with their roman page
 * numbers, as the reference does.
 *
 * Personal details are placeholders in square brackets, to be completed by
 * the student before submission.
 */
const fs = require('fs');
const path = require('path');
const K = require('./kit');
const { Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } = require('docx');
const { p, BODY_FONT } = K;

const NAME = '[STUDENT FULL NAME]';
const REG = '[REGISTRATION NUMBER]';
const SUPERVISOR = '[SUPERVISOR NAME]';
const DATE = '[MONTH], 2026';

const gap = (n = 1, after = 200) => Array.from({ length: n },
  () => new Paragraph({ spacing: { after }, children: [] }));

const line = (text, opts = {}) => new Paragraph({
  alignment: opts.align ?? AlignmentType.CENTER,
  spacing: { after: opts.after ?? 200, line: 360 },
  children: [new TextRun({ text, bold: opts.bold ?? true, size: opts.size ?? 22, font: BODY_FONT })],
});

/** A front-matter title: centred, bold, listed in the table of contents. */
function heading(text, first = false) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: !first,
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 300 },
    children: [new TextRun({ text, bold: true, size: 24, font: BODY_FONT })],
  });
}

function logo() {
  const file = path.join(process.env.FIGDIR, 'front', 'umma-logo.png');
  const buf = fs.readFileSync(file);
  const w = 1.9 * 96;
  const h = Math.round((buf.readUInt32BE(20) / buf.readUInt32BE(16)) * w);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(w), height: h } })],
  });
}

function titlePage() {
  return [
    ...gap(1),
    logo(),
    line('Digital Madrasa: An Integrated Application That Will Manage Madrasas in Kenya', { after: 160 }),
    line(NAME, { after: 160 }),
    line(REG, { after: 480 }),
    line('This project is submitted in partial fulfillment of the requirements for the award of '
      + 'Bachelor of Science in Computer Science.', { after: 160 }),
    line('School of Business and Technology', { after: 160 }),
    line('Umma University', { after: 160 }),
    line('Kajiado, Kenya', { after: 480 }),
    line(DATE, { after: 200 }),
    ...gap(6),
    line('This thesis is available for library use on the understanding that it is copyright '
      + 'material and that no quotation from the thesis may be published without proper '
      + 'acknowledgment.', { align: AlignmentType.LEFT }),
  ];
}

function declaration() {
  return [
    heading('DECLARATION', true),
    p([{ text: 'I ', bold: true }, { text: `${NAME} hereby declare that this document is entirely my own `
      + 'work and has not been submitted to any university or institution for the award of a '
      + 'degree. To the best of my knowledge, it does not include any material information '
      + 'authored or published by others except where it is acknowledged and referenced.' }]),
    p('Student’s signature:'),
    ...gap(1),
    p(`Name: ${NAME}    Registration number: ${REG}`),
    p('Signature: ..................................................    Date: ..................................'),
    ...gap(2),
    p('This system project has been submitted for examination with my approval as university '
      + 'supervisor.'),
    p('Supervisor’s signature:'),
    ...gap(1),
    p('Signature: ..................................................    Date: ..................................'),
    p(SUPERVISOR, { spacing: { after: 0, line: 360 } }),
    p('School of Business and Technology, Umma University,', { spacing: { after: 0, line: 360 } }),
    p('Kenya'),
  ];
}

function dedication() {
  return [
    heading('DEDICATION'),
    p('I dedicate this work to my beloved parents and family for their love, prayers and '
      + 'support throughout my studies, and to my friends, mentors and siblings for their '
      + 'encouragement. I also dedicate it to the Muslim community of Kenya, especially the '
      + 'students, teachers and parents of our duksi and madrasas. May this work contribute in '
      + 'a small way to the teaching and memorisation of the Holy Quran.'),
  ];
}

function acknowledgement() {
  return [
    heading('ACKNOWLEDGEMENT'),
    p('All praise is due to Allah (SWT) for granting me health, strength and perseverance to '
      + 'complete this project.'),
    p(`I sincerely thank my supervisor, ${SUPERVISOR}, for the guidance and feedback given `
      + 'throughout the project. I thank my parents and family for their prayers, encouragement '
      + 'and support, and my relatives, friends and classmates for their motivation.'),
    p('I am grateful to Umma University and the School of Business and Technology for the '
      + 'learning environment that made this work possible. May Allah (SWT) reward all who '
      + 'supported me. Ameen.'),
  ];
}

function abstract() {
  return [
    heading('ABSTRACT'),
    p('Madrasas and duksi in Kenya teach Quran recitation and memorisation to large numbers of '
      + 'children, but they are administered informally: attendance, memorisation progress and fees '
      + 'are recorded in exercise books or not at all, parents have little reliable information about '
      + 'their children, and fee payments are not linked to invoices. Existing Quran applications '
      + 'serve individual learners, while school management systems have no Quran-specific '
      + 'functions. This project developed the Digital Madrasa Mobile Application, an integrated '
      + 'mobile application for managing madrasas in Kenya, implemented under the brand ILMORA '
      + '(Integrated Qur’an & Madrasa Learning).'),
    p('The system was developed using the Agile methodology with React Native (Expo) and '
      + 'TypeScript for the mobile application and Supabase (PostgreSQL, authentication, storage and '
      + 'Edge Functions) for the backend. Each madrasa is a separate tenant whose records are '
      + 'protected by Row Level Security on every table. The application serves madrasa owners, '
      + 'teachers, parents and students, and provides student admission, classes, manual and QR-code '
      + 'attendance, memorisation tracking, recitation recording with teacher review, parent–child '
      + 'linking approved by the madrasa, AI recitation feedback given only with a parent’s '
      + 'consent, master-reciter comparison, a live reading room with scheduled lessons, a '
      + 'teacher-chosen Quran video library, fee invoicing with M-Pesa and card payment, '
      + 'parent–teacher messaging, offline attendance, notifications, and an interface in English, '
      + 'Kiswahili, Somali and Arabic.'),
    p('Unit, functional and user interface testing showed that the core features work as required '
      + 'and that users cannot reach records outside their madrasa or role: all 172 unit tests and '
      + '78 functional test cases passed, 21 database suites proved 145 security guarantees, and '
      + 'the installed app passed 30 of 31 interface checks. M-Pesa runs on Safaricom’s Daraja '
      + 'sandbox, while card, e-mail and SMS run on mock providers until live credentials are '
      + 'configured. The project shows that a secure, '
      + 'integrated madrasa management application for Kenya is feasible.'),
    p([{ text: 'Keywords: ', bold: true },
       { text: 'Digital Madrasa, ILMORA, madrasa management, Quran memorisation, mobile application, '
               + 'React Native, Supabase, M-Pesa, Kenya.' }]),
  ];
}

module.exports = { titlePage, declaration, dedication, acknowledgement, abstract, gap, NAME, REG, SUPERVISOR };

// UML class diagram of the core domain. Attributes are real columns
// (schema2.json); operations are real ApiClient methods
// (apps/mobile/src/api/supabase/index.ts) or Edge Function actions.
//   node classdiag.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { Graphviz } from '@hpcc-js/wasm-graphviz';

const [outDir] = process.argv.slice(2);
const gv = await Graphviz.load();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const C = {
  Madrasa: [['id: uuid', 'name, slug: text', 'county, town: text', 'status: madrasa_status'],
    ['registerMadrasa()', 'suspend() / reinstate() [lifecycle fn]']],
  Profile: [['id: uuid (= auth user)', 'role: user_role', 'madrasaId: uuid', 'fullName, email', 'locale: en|sw|so|ar'],
    ['signIn()', 'signOut()', 'updateProfile()']],
  Teacher: [['employeeNo: text', 'qiraahStyles: qiraah_style[]', 'isOwner: boolean', 'status: teacher_status'],
    ['listTeachers()', 'inviteTeacher() †']],
  Class: [['name, level: text', 'capacity: int', 'schedule: jsonb'], ['createClass()', 'listClasses()']],
  Student: [['admissionNo: text (DM-YYYY-NNNN)', 'dateOfBirth: date', 'gender: text', 'enrollmentStatus'],
    ['createStudent()', 'listStudents()']],
  Parent: [['profileId: uuid', 'madrasaId: uuid'], ['registerParent()', 'listChildren()']],
  ParentStudentLink: [['relationship: relationship_type', 'status: link_status', 'decidedAt'],
    ['linkChild()', 'decideLinkRequest()', 'revokeLink()']],
  Attendance: [['sessionDate: date', 'status: attendance_status', 'method: manual|qr'],
    ['markAttendance()', 'getAttendanceQrToken()', 'markAttendanceByQr()']],
  HifzProgress: [['surahNo, ayahNo: int', 'juzNo: int', 'status: hifz_status'], ['listHifzProgress()']],
  Recitation: [['surahNo, ayahFrom, ayahTo', 'qiraahStyle', 'audioUrl: storage path', 'durationMs'],
    ['createRecitation()', 'getRecitationAudioUrl()']],
  TajweedFeedback: [['overallScore: numeric', 'errors: jsonb', 'modelVersion: text', 'teacherOverride: jsonb'],
    ['awaitTajweedFeedback()', 'saveTeacherOverride()']],
  FeeStructure: [['name, term: text', 'amount: numeric', 'appliesTo: fee_scope'], ['createFeeStructure()']],
  Invoice: [['invoiceNo: text', 'amountDue, amountPaid', 'dueDate: date', 'status: invoice_status'],
    ['previewInvoices()', 'issueInvoices()', 'listInvoices()']],
  Announcement: [['title, body: text', 'audience: text[]'], ['createAnnouncement()']],
};

const node = (name, [attrs, ops]) => `  ${name} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#4a4a4a">
    <TR><TD BGCOLOR="#faf3dc" SIDES="B" BORDER="1"><B>${name}</B></TD></TR>
    <TR><TD ALIGN="LEFT" SIDES="B" BORDER="1" BALIGN="LEFT">${attrs.map(esc).join('<BR/>')}</TD></TR>
    <TR><TD ALIGN="LEFT" BALIGN="LEFT"><FONT COLOR="#2f5d8c">${ops.map(esc).join('<BR/>')}</FONT></TD></TR>
  </TABLE>>];`;

// [from, to, fromMult, toMult] — from the foreign keys and UNIQUE constraints
const REL = [
  ['Profile', 'Madrasa', '*', '0..1'], ['Teacher', 'Profile', '0..*', '1'], ['Teacher', 'Madrasa', '*', '1'],
  ['Class', 'Madrasa', '*', '1'], ['Class', 'Teacher', '*', '0..1'], ['Student', 'Class', '*', '0..1'],
  ['Student', 'Profile', '0..*', '1'], ['Student', 'Madrasa', '*', '1'], ['Parent', 'Profile', '0..1', '1'],
  ['ParentStudentLink', 'Parent', '*', '1'], ['ParentStudentLink', 'Student', '*', '1'],
  ['Attendance', 'Student', '*', '1'], ['Attendance', 'Class', '*', '1'], ['HifzProgress', 'Student', '*', '1'],
  ['Recitation', 'Student', '*', '1'], ['TajweedFeedback', 'Recitation', '0..1', '1'],
  ['TajweedFeedback', 'Teacher', '*', '0..1'], ['Invoice', 'Student', '*', '1'],
  ['Invoice', 'FeeStructure', '*', '0..1'], ['FeeStructure', 'Madrasa', '*', '1'],
  ['Announcement', 'Madrasa', '*', '1'], ['Announcement', 'Profile', '*', '1'],
];

const dot = `digraph classes {
  graph [rankdir=BT, splines=ortho, nodesep=0.35, ranksep=0.55, pad=0.2, bgcolor="white"];
  node  [shape=plaintext, margin=0, fontname="Arial", fontsize=12];
  edge  [fontname="Arial", fontsize=9, arrowhead=none, color="#4a4a4a", fontcolor="#2f5d8c", labeldistance=1.4];
${Object.entries(C).map(([n, v]) => node(n, v)).join('\n')}
${REL.map(([a, b, ma, mb]) => `  ${a} -> ${b} [taillabel="${ma}", headlabel="${mb}"];`).join('\n')}
}`;
writeFileSync(`${outDir}/class.dot`, dot);
writeFileSync(`${outDir}/class.svg`, gv.dot(dot));
console.log('  wrote class.svg');

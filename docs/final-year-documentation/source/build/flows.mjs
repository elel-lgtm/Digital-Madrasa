// Context diagram, DFD level 0, DFD level 1 and the user workflow diagram.
// Processes are named after the deployed Edge Functions and RLS-scoped table
// access; data stores are real tables (see schema2.json).
//
//   node flows.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { Graphviz } from '@hpcc-js/wasm-graphviz';

const [outDir] = process.argv.slice(2);
const gv = await Graphviz.load();

const C = {
  ink: '#1a1a1a', muted: '#5a5a5a', line: '#4a4a4a',
  fill: '#f4f1ea', accent: '#faf3dc', accentEdge: '#c9a227',
  blue: '#eaf0f7', green: '#eaf3ec', red: '#f9ecea',
};

const head = (rankdir = 'LR', extra = '') => `
  graph [rankdir=${rankdir}, bgcolor="white", fontname="Arial", pad=0.3, nodesep=0.45, ranksep=0.9, splines=true ${extra}];
  node  [fontname="Arial", fontsize=14, color="${C.line}", penwidth=1.1, style=filled];
  edge  [fontname="Arial", fontsize=12.5, color="${C.line}", fontcolor="${C.muted}", arrowsize=0.7, penwidth=1.0];`;

const entity = (id, label) => `  ${id} [shape=box, label="${label}", fillcolor="${C.fill}", fontname="Arial Bold", margin="0.25,0.12"];`;
const proc = (id, num, label) => `  ${id} [shape=ellipse, label="${num}\\n${label}", fillcolor="${C.accent}", color="${C.accentEdge}", margin="0.12,0.06"];`;
// Gane–Sarson style open-ended store rendered as a record with an ID cell.
const store = (id, num, label) => `  ${id} [shape=record, label="${num}|${label}", fillcolor="${C.blue}", fontsize=13];`;

function write(file, dot) {
  writeFileSync(`${outDir}/${file}.dot`, dot);
  writeFileSync(`${outDir}/${file}.svg`, gv.dot(dot));
  console.log(`  wrote ${file}.svg`);
}

// ------------------------------------------------------------ Context diagram
const external = (id, label) => `  ${id} [shape=box, label="${label}", fillcolor="${C.red}", fontname="Arial Bold", margin="0.25,0.12", style="filled,dashed"];`;
write('context', `digraph context {${head('LR', ', ranksep=1.6, nodesep=0.5')}
${entity('owner', 'MADRASA OWNER')}
${entity('teacher', 'TEACHER')}
${entity('student', 'STUDENT')}
${entity('parent', 'PARENT')}
${entity('admin', 'PLATFORM\\nADMINISTRATOR')}
${entity('visitor', 'VISITOR')}
${external('mpesa', 'SAFARICOM\\nDARAJA (M-PESA)')}
${external('push', 'EXPO PUSH\\nSERVICE')}
${external('msg', 'E-MAIL / SMS\\nPROVIDERS')}
  sys [shape=circle, width=2.4, fixedsize=true, label="0\\nDIGITAL MADRASA\\nSYSTEM", fillcolor="${C.accent}", color="${C.accentEdge}", fontname="Arial Bold", fontsize=12];
  { rank=same; owner; teacher; student; parent; }
  { rank=same; admin; visitor; mpesa; push; msg; }
  owner   -> sys [label="madrasa registration, staff,\\nclasses, fee structures,\\nsubscription payment"];
  sys     -> owner [label="dashboards, link requests,\\ninvoices, receipts"];
  teacher -> sys [label="attendance, grades, marks,\\nmemorisation, certificates,\\nrecitation reviews"];
  sys     -> teacher [label="rosters, QR token,\\nreview and marking queues"];
  student -> sys [label="recitation audio, QR scan,\\nhanded-in work"];
  sys     -> student [label="feedback, progress,\\nassignments, Quran text"];
  parent  -> sys [label="link request, messages,\\nM-Pesa fee payment"];
  sys     -> parent [label="child progress, invoices,\\nreceipts, notices"];
  admin   -> sys [label="suspend / reinstate /\\nschedule / purge"];
  sys     -> admin [label="platform overview,\\naudit trail"];
  visitor -> sys [label="certificate code"];
  sys     -> visitor [label="certificate validity"];
  sys     -> mpesa [label="STK push request"];
  mpesa   -> sys [label="payment result\\n(callback)"];
  sys     -> push [label="push notices"];
  push    -> sys [label="delivery tickets"];
  sys     -> msg [label="e-mail and SMS"];
}`);

// ------------------------------------------------------------- DFD level 0
write('dfd0', `digraph dfd0 {${head('LR', ', ranksep=1.1, nodesep=0.35')}
${entity('owner', 'Owner')}
${entity('teacher', 'Teacher')}
${entity('student', 'Student')}
${entity('parent', 'Parent')}
${entity('admin', 'Platform\\nAdministrator')}
${proc('p1', '1.0', 'Authenticate &\\nresolve role')}
${proc('p2', '2.0', 'Manage madrasa,\\nstaff & classes')}
${proc('p3', '3.0', 'Admit students &\\nlink parents')}
${proc('p4', '4.0', 'Record\\nattendance')}
${proc('p5', '5.0', 'Recitation &\\ntajweed feedback')}
${proc('p6', '6.0', 'Fees, invoicing\\n& M-Pesa payment')}
${proc('p7', '7.0', 'Communication &\\nnotice delivery')}
${proc('p8', '8.0', 'Madrasa\\nlifecycle')}
${store('d1', 'D1', 'profiles')}
${store('d2', 'D2', 'madrasas / teachers / classes')}
${store('d3', 'D3', 'students / parent_student_links')}
${store('d4', 'D4', 'attendance')}
${store('d5', 'D5', 'recitations / tajweed_feedback')}
${store('d6', 'D6', 'Storage: recitations bucket')}
${store('d7', 'D7', 'fee_structures / invoices')}
${store('d8', 'D8', 'announcements / messages / notifications')}
${store('d9', 'D9', 'audit_log')}
  { rank=same; owner; teacher; student; parent; admin; }
  { rank=same; d1; d2; d3; d4; d5; d6; d7; d8; d9; }
  owner -> p1 [label="credentials"]; teacher -> p1; student -> p1; parent -> p1;
  p1 -> d1 [label="role, madrasa_id"];
  owner -> p2 [label="staff, classes"]; p2 -> d2;
  owner -> p3 [label="student details"]; parent -> p3 [label="admission no. + DOB"];
  teacher -> p3 [label="approve / reject"]; p3 -> d3 [label="admission no.,\\nlink status"];
  teacher -> p4 [label="marks, QR token"]; student -> p4 [label="QR scan"];
  p4 -> d4 [label="present / absent"]; d3 -> p4 [label="enrolment"];
  student -> p5 [label="audio"]; p5 -> d6 [label="private object"];
  p5 -> d5 [label="findings,\\nscore"]; teacher -> p5 [label="override"];
  d5 -> parent [label="reviewed result"];
  owner -> p6 [label="fee structure,\\ntarget"]; p6 -> d7 [label="numbered invoices"];
  d7 -> parent [label="balance, invoices"];
  teacher -> p7 [label="announcement"]; parent -> p7 [label="message"]; p7 -> d8;
  admin -> p8 [label="action + reason"]; p8 -> d2 [label="status"]; p8 -> d9;
}`);

// ------------------------------------------------------------- DFD level 1
write('dfd1', `digraph dfd1 {${head('TB', ', ranksep=0.55, nodesep=0.5')}
${entity('student', 'Student')}
${entity('teacher', 'Teacher')}
${entity('parent', 'Approved\\nParent')}
${proc('p51', '5.1', 'Issue signed\\nupload URL')}
${proc('p52', '5.2', 'Upload audio')}
${proc('p53', '5.3', 'Create recitation\\n& evaluate')}
${proc('p54', '5.4', 'Queue for\\nteacher review')}
${proc('p55', '5.5', 'Play back via\\nsigned URL')}
${proc('p56', '5.6', 'Save teacher\\noverride')}
${proc('p57', '5.7', 'Publish reviewed\\nresult')}
${store('d1', 'D1', 'profiles / students')}
${store('d5a', 'D5', 'recitations')}
${store('d5b', 'D5', 'tajweed_feedback')}
${store('d6', 'D6', 'Storage: recitations bucket')}
${store('rl', 'D10', 'rate_limits')}
  student -> p51 [label="surah, ayah range"];
  d1 -> p51 [label="madrasa_id"]; p51 -> rl [label="count request"];
  p51 -> p52 [label="signed URL +\\nscoped path"];
  student -> p52 [label="audio file"]; p52 -> d6 [label="PUT object"];
  p52 -> p53 [label="storage path"];
  p53 -> d5a [label="recitation row"];
  p53 -> d5b [label="provisional findings\\n(placeholder-v1)"];
  d5b -> p54 [label="unreviewed"]; p54 -> teacher [label="review queue"];
  teacher -> p55; d6 -> p55 [label="audio (20-min URL)"];
  teacher -> p56 [label="score, remarks"]; p56 -> d5b [label="teacher_override"];
  d5b -> p57; p57 -> student [label="feedback"]; p57 -> parent [label="reviewed result"];
}`);

// ------------------------------------------------------------- workflow
const lane = (id, label, color, body) => `
  subgraph cluster_${id} {
    label="${label}"; labeljust=l; fontname="Arial Bold"; fontsize=12;
    style="rounded,filled"; fillcolor="${color}"; color="#c9c2b4";
${body}
  }`;
const step = (id, label, shape = 'box') =>
  `    ${id} [shape=${shape}, style="rounded,filled", fillcolor="white", label="${label}", margin="0.18,0.08"];`;

write('workflow', `digraph workflow {${head('TB', ', ranksep=0.45, nodesep=0.3, newrank=true')}
${lane('owner', 'Owner', '#fcfaf5', [
  step('o1', 'Register madrasa\n(owner account created)'),
  step('o2', 'Add classes and\nteaching staff'),
  step('o3', 'Admit student\n(admission no. issued by trigger)'),
  step('o4', 'Define fee structure and\nissue invoices to a target'),
].join('\n'))}
${lane('parent', 'Parent', '#f3f6fa', [
  step('pa1', 'Create parent account'),
  step('pa2', 'Request link with\nadmission no. + date of birth'),
  step('pa3', "View child's progress,\nattendance, grades, fees"),
].join('\n'))}
${lane('teacher', 'Teacher / Owner', '#fbf6e6', [
  step('t1', 'Approve or reject\nlink request'),
  step('t2', 'Take attendance\n(manual or rotating QR)'),
  step('t3', 'Review recitation,\noverride score'),
].join('\n'))}
${lane('student', 'Student', '#f1f7f2', [
  step('s1', 'Scan class QR code'),
  step('s2', 'Record recitation'),
  step('s3', 'Receive provisional\nfeedback'),
].join('\n'))}
  o1 -> o2 -> o3 -> o4;
  pa1 -> pa2;
  pa2 -> t1 [label="pending link"];
  t1 -> pa3 [label="approved: RLS opens\nchild's records"];
  o3 -> pa2 [style=dashed, label="admission no.\nshared with family"];
  t2 -> s1 [label="token rotates\nevery 30 s"];
  s1 -> t2 [style=dashed, label="attendance row"];
  s2 -> s3 -> t3;
  t3 -> pa3 [label="reviewed result"];
  o4 -> pa3 [label="invoice"];
}`.replace(/\n    (\w+) \[shape=box, style="rounded,filled", fillcolor="white", label="([^"]*)"/g,
  (m, id, lbl) => `\n    ${id} [shape=box, style="rounded,filled", fillcolor="white", label="${lbl.replace(/\n/g, '\\n')}"`));

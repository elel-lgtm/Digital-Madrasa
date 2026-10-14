// Generates every Entity Relationship Diagram in the report from schema2.json
// (live schema + migration constraints), so no ERD can drift from the database.
//
//   node erd.mjs <schema2.json> <outDir>
//
// Writes one .svg per diagram; render.py turns them into PNGs.
import { readFileSync, writeFileSync } from 'node:fs';
import { Graphviz } from '@hpcc-js/wasm-graphviz';

const [schemaPath, outDir] = process.argv.slice(2);
const S = JSON.parse(readFileSync(schemaPath, 'utf8'));
const gv = await Graphviz.load();

const AUDIT = new Set(['created_at', 'updated_at', 'deleted_at']);
const HEAD = '#dce8f5';
const EDGE = '#2f5d8c';
const STUB = '#eeeeee';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shortType(t) {
  return ({
    'timestamp with time zone': 'timestamptz',
    'character varying': 'varchar',
    'character': 'char',
    'ARRAY': 'array',
    'USER-DEFINED': 'enum',
  })[t] ?? (t.startsWith('_') ? t.slice(1) + '[]' : t);
}

function tag(c) {
  const tags = [];
  if (c.pk) tags.push('PK');
  if (c.fk) tags.push('FK');
  if (c.unique) tags.push('UQ');
  return tags.length ? ` (${tags.join(', ')})` : '';
}

// mode: 'keys'  -> PK/FK/UQ columns only (complete ERD)
//       'full'  -> keys first, then the most important attributes, with types
function entity(name, mode, max = 9) {
  const cols = S[name].columns;
  const keys = cols.filter((c) => c.pk || c.fk || c.unique);
  let shown = keys;
  let hidden = 0;
  if (mode === 'full') {
    const rest = cols.filter((c) => !(c.pk || c.fk || c.unique) && !AUDIT.has(c.name));
    const room = Math.max(max - keys.length, 2);
    shown = [...keys, ...rest.slice(0, room)];
    hidden = cols.length - shown.length;
  } else {
    hidden = cols.length - shown.length;
  }
  const rows = shown.map((c) => {
    const type = mode === 'full' ? ` <FONT COLOR="#555555">: ${esc(shortType(c.type))}</FONT>` : '';
    const name = c.pk ? `<B>${esc(c.name)}</B>` : esc(c.name);
    return `<TR><TD ALIGN="LEFT" PORT="${c.name}">• ${name}${esc(tag(c))}${type}</TD></TR>`;
  });
  if (hidden > 0) {
    rows.push(`<TR><TD ALIGN="LEFT"><FONT COLOR="#777777" POINT-SIZE="9">+ ${hidden} more column${hidden > 1 ? 's' : ''}</FONT></TD></TR>`);
  }
  return `  "${name}" [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="${EDGE}" BGCOLOR="white">
    <TR><TD BGCOLOR="${HEAD}" ALIGN="CENTER"><B>${esc(name)}</B></TD></TR>
    ${rows.join('\n    ')}
  </TABLE>>];`;
}

function stub(name) {
  return `  "${name}" [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4" COLOR="#888888" STYLE="dashed" BGCOLOR="${STUB}">
    <TR><TD><I>${esc(name)}</I></TD></TR></TABLE>>];`;
}

// Every FK edge between two tables that are both drawn.
function edges(drawn, { tenantEdges = true } = {}) {
  const out = [];
  for (const t of drawn) {
    for (const c of S[t]?.columns ?? []) {
      if (!c.fk) continue;
      const target = c.fk.table || 'auth.users';
      if (!drawn.has(target)) continue;
      const tenant = c.name === 'madrasa_id' && target === 'madrasas';
      if (tenant && !tenantEdges) continue;
      const one = c.unique || c.pk;               // UNIQUE FK => 1:1
      const optional = c.nullable ? '0..' : '';
      const style = tenant
        ? `color="#a9bfd6", penwidth=0.7, fontcolor="#7d95ad"`
        : `color="${EDGE}", penwidth=1.1, fontcolor="${EDGE}"`;
      out.push(`  "${t}" -> "${target}" [taillabel="${one ? '1' : 'N'}", headlabel="${optional}1", ${style}, arrowhead=none, arrowtail=none];`);
    }
  }
  return out;
}

function graph(name, body, { rankdir = 'LR', nodesep = 0.35, ranksep = 0.9, splines = 'ortho' } = {}) {
  return `digraph "${name}" {
  graph [rankdir=${rankdir}, splines=${splines}, nodesep=${nodesep}, ranksep=${ranksep}, pad=0.25, bgcolor="white", fontname="Arial"];
  node  [shape=plaintext, margin=0, fontname="Arial", fontsize=13];
  edge  [fontname="Arial", fontsize=12, labeldistance=1.5, labelangle=25, dir=both];
${body.join('\n')}
}`;
}

function write(file, dot) {
  writeFileSync(`${outDir}/${file}.dot`, dot);
  writeFileSync(`${outDir}/${file}.svg`, gv.dot(dot));
  console.log(`  wrote ${file}.svg`);
}

// ------------------------------------------------------------ complete ERD
// Overview: every table as a named box with its column count, every
// non-tenant foreign key as a line with cardinality. Keys and attributes are
// shown in the module ERDs and the entity tables, where they stay legible.
function nameBox(t) {
  const n = S[t] ? S[t].columns.length : 0;
  const sub = S[t] ? `<TR><TD><FONT POINT-SIZE="10" COLOR="#555555">${n} columns</FONT></TD></TR>` : '';
  return `  "${t}" [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="${EDGE}">
    <TR><TD BGCOLOR="${S[t] ? HEAD : STUB}"><B>${esc(t)}</B></TD></TR>${sub}</TABLE>>];`;
}
{
  const all = new Set([...Object.keys(S), 'auth.users']);
  const body = [...[...all].sort().map(nameBox), ...edges(all, { tenantEdges: false })];
  write('erd-complete', graph('complete', body, { nodesep: 0.18, ranksep: 0.55 }));
}

// ------------------------------------------------------------- module ERDs
const MODULES = {
  'erd-identity': {
    tables: ['profiles', 'madrasas', 'teachers', 'students', 'parents', 'parent_student_links', 'classes', 'enrollments'],
    stubs: ['auth.users'], tenant: true, max: 7,
  },
  'erd-attendance': {
    tables: ['classes', 'enrollments', 'attendance', 'students'],
    stubs: ['teachers', 'profiles'], max: 8,
  },
  'erd-learning': {
    tables: ['lessons', 'assignments', 'submissions', 'grades', 'hifz_progress', 'certificates'],
    stubs: ['students', 'classes', 'profiles'], max: 7,
  },
  'erd-recitation': {
    tables: ['recitations', 'tajweed_feedback'],
    stubs: ['students', 'teachers', 'assignments'], max: 10,
  },
  'erd-fees': {
    tables: ['fee_structures', 'invoices', 'payments', 'payment_allocations', 'receipts', 'saved_cards'],
    stubs: ['students', 'parents', 'classes'], max: 7,
  },
  'erd-subscription': {
    tables: ['subscriptions', 'subscription_plans', 'subscription_invoices', 'subscription_payments', 'saved_cards'],
    stubs: [], max: 7,
  },
  'erd-communication': {
    tables: ['announcements', 'message_threads', 'messages', 'notifications', 'notification_preferences', 'mail_outbox', 'sms_outbox', 'push_tokens'],
    stubs: ['profiles', 'students'], max: 7,
  },
};

for (const [file, { tables, stubs, tenant = false, max }] of Object.entries(MODULES)) {
  const drawn = new Set([...tables, ...stubs]);
  const body = [
    ...stubs.map(stub),
    ...tables.map((t) => entity(t, 'full', max)),
    ...edges(drawn, { tenantEdges: tenant }),
  ];
  write(file, graph(file, body, { nodesep: 0.22, ranksep: 0.6 }));
}

// ------------------------------------------------------ core ERD (portrait)
// The report's single ERD: the core entities with their keys, laid out top to
// bottom so it fits a portrait page.
{
  const tables = ['madrasas', 'profiles', 'teachers', 'students', 'parents', 'parent_student_links',
    'classes', 'enrollments', 'attendance', 'hifz_progress', 'recitations', 'tajweed_feedback',
    'assignments', 'submissions', 'certificates', 'fee_structures', 'invoices', 'payments', 'receipts',
    'announcements', 'notifications'];
  const drawn = new Set(tables);
  const body = [...tables.map((t) => entity(t, 'full', 5)), ...edges(drawn, { tenantEdges: false })];
  write('erd-core', graph('core', body, { rankdir: 'LR', nodesep: 0.2, ranksep: 0.7 }));
}

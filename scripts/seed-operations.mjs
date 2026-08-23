#!/usr/bin/env node
/**
 * Seeds the operational side: fees, invoices, assignments, announcements and
 * inbox items.
 *
 *   npm run db:seed:ops
 *
 * Every screen query already succeeds without this — but several return zero
 * rows, so the app renders empty states everywhere and you cannot tell a
 * working screen from a broken one. Idempotent.
 */
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv('supabase/.env');
const ref = env.SUPABASE_PROJECT_REF;
const token = env.SUPABASE_ACCESS_TOKEN;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}

console.log('Seeding fees, assignments, announcements and inbox…');

await sql(`
do $$
declare
  v_madrasa uuid;
  v_owner   uuid;
  v_class   uuid;
  v_fee     uuid;
  v_student record;
  v_year    int := extract(year from now())::int;
  v_seq     int := 0;
begin
  select id into v_madrasa from public.madrasas order by created_at limit 1;
  select owner_id into v_owner from public.madrasas where id = v_madrasa;
  select id into v_class from public.classes where madrasa_id = v_madrasa order by created_at limit 1;

  -- ------------------------------------------------------------ fee structure
  select id into v_fee from public.fee_structures
   where madrasa_id = v_madrasa and name = 'Term 1 Tuition';

  if v_fee is null then
    insert into public.fee_structures
      (madrasa_id, name, academic_year, term, amount, currency, applies_to, is_active)
    values (v_madrasa, 'Term 1 Tuition', v_year, 'Term 1', 4500.00, 'KES', 'all', true)
    returning id into v_fee;
  end if;

  -- ---------------------------------------------------------------- invoices
  -- One per student, deliberately in different states so the status chips,
  -- the overdue styling and the parent's outstanding balance all have
  -- something real to render.
  for v_student in
    select s.id, s.admission_no, row_number() over (order by s.admission_no) as n
      from public.students s where s.madrasa_id = v_madrasa
  loop
    v_seq := v_seq + 1;
    if not exists (select 1 from public.invoices where student_id = v_student.id) then
      insert into public.invoices
        (madrasa_id, student_id, invoice_no, fee_structure_id, amount_due, amount_paid,
         currency, due_date, status, issued_at, description, notes)
      values (
        v_madrasa, v_student.id,
        'INV-' || v_year::text || '-' || lpad(v_seq::text, 4, '0'),
        v_fee, 4500.00,
        case v_student.n when 1 then 4500.00 when 2 then 2000.00 else 0 end,
        'KES',
        (now() + case v_student.n when 3 then interval '-10 days' else interval '14 days' end)::date,
        case v_student.n when 1 then 'paid' when 2 then 'partially_paid'
             when 3 then 'overdue' else 'issued' end::invoice_status,
        now() - interval '20 days',
        'Term 1 tuition',
        'Term 1 tuition'
      );
    end if;
  end loop;

  -- ------------------------------------------------------------- assignments
  if not exists (select 1 from public.assignments where madrasa_id = v_madrasa) then
    insert into public.assignments
      (madrasa_id, class_id, title, instructions, assignment_type, due_at)
    values
      (v_madrasa, v_class, 'Recite Al-Mulk 1-15 from memory',
       'Record yourself reciting without looking at the mushaf. Take your time.',
       'memorisation', now() + interval '3 days'),
      (v_madrasa, v_class, 'Noon sakinah worksheet',
       'Identify izhar, idgham, iqlab and ikhfa in the given ayat.',
       'written', now() + interval '6 days'),
      (v_madrasa, v_class, 'Tajweed: qalqalah practice',
       'Record the five qalqalah letters with examples.',
       'tajweed', now() - interval '2 days');
  end if;

  -- ----------------------------------------------------------- announcements
  if not exists (select 1 from public.announcements where madrasa_id = v_madrasa) then
    insert into public.announcements
      (madrasa_id, author_id, title, body, audience, publish_at)
    values
      (v_madrasa, v_owner, 'Ramadan timetable',
       'Classes move to 9:00-11:00 for the month. Evening revision is optional.',
       array['students','parents','teachers'], now() - interval '2 days'),
      (v_madrasa, v_owner, 'Term 1 fees now due',
       'Term 1 invoices have been issued. Payment can be made by M-Pesa or card in the app.',
       array['parents'], now() - interval '5 days');
  end if;

  -- ------------------------------------------------------------------ inbox
  -- Notifications are what the Inbox screen reads, so seed one per person.
  insert into public.notifications (user_id, madrasa_id, type, title, body, channel)
  select p.id, v_madrasa, 'announcement', 'Ramadan timetable',
         'Classes move to 9:00-11:00 for the month.', array['in_app']
    from public.profiles p
   where p.madrasa_id = v_madrasa
     and not exists (
       select 1 from public.notifications n
        where n.user_id = p.id and n.title = 'Ramadan timetable'
     );

  insert into public.notifications (user_id, madrasa_id, type, title, body, channel)
  select p.id, v_madrasa, 'fee_due', 'Term 1 fees are due',
         'Term 1 tuition of KES 4,500 is due this month.', array['in_app','email']
    from public.profiles p
   where p.madrasa_id = v_madrasa and p.role = 'parent'
     and not exists (
       select 1 from public.notifications n
        where n.user_id = p.id and n.title = 'Term 1 fees are due'
     );
end $$;
`);

const [summary] = await sql(`
  select (select count(*) from public.fee_structures) as fee_structures,
         (select count(*) from public.invoices)       as invoices,
         (select count(*) from public.assignments)    as assignments,
         (select count(*) from public.announcements)  as announcements,
         (select count(*) from public.notifications)  as notifications;
`);

console.log('\n✓ Operational data seeded');
console.log(
  `  fee structures ${summary.fee_structures} · invoices ${summary.invoices} · assignments ${summary.assignments}`,
);
console.log(`  announcements ${summary.announcements} · notifications ${summary.notifications}`);

#!/usr/bin/env node
/**
 * Database cost of the hot queries, with row-level security in the loop.
 *
 *   npm run perf:db
 *   PERF_PUPILS=5000 npm run perf:db
 *
 * `perf:api` times requests end to end, where the network dominates. This
 * isolates the database: every query runs as the real signed-in user
 * (`set local role authenticated` plus that user's JWT claims), so the RLS
 * policies and their SECURITY DEFINER helpers are part of what is measured,
 * and `EXPLAIN ANALYZE` reports the server's own execution time. Each query is
 * run five times and the median reported.
 *
 *   1. today   the seeded school, as its owner, a parent and a student
 *   2. scale   a synthetic school of PERF_PUPILS pupils (default 2,000) with
 *              three invoices, twenty days of attendance and five memorisation
 *              rows each, built inside a transaction that is rolled back — so
 *              nothing is left behind. It answers the question the seed is too
 *              small to: does RLS stay cheap as a school grows, and does a
 *              parent's view stay independent of the school's size?
 *
 * Fails if any median exceeds its budget.
 */
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv('supabase/.env');
const PUPILS = Number(process.env.PERF_PUPILS ?? 2000);

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${body?.message ?? ''}`.slice(0, 400));
  return body;
}

/** Median server execution time (ms) per query, measured as the given users. */
const MEASURE = `
  create or replace function pg_temp.perf_measure(p_user uuid, p_sql text)
  returns numeric language plpgsql as $f$
  declare plan json; times numeric[] := '{}';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
    for i in 1..5 loop
      execute 'explain (analyze, format json) ' || p_sql into plan;
      times := times || (plan -> 0 ->> 'Execution Time')::numeric;
    end loop;
    reset role;
    return (select percentile_cont(0.5) within group (order by t) from unnest(times) t);
  end $f$;`;

const QUERIES = {
  owner: [
    ['students with names', `select s.id, s.admission_no, p.full_name from public.students s join public.profiles p on p.id = s.profile_id where s.deleted_at is null`, 250],
    ['open invoices', `select id, amount_due, amount_paid, status from public.invoices where status in ('issued','partially_paid','overdue')`, 250],
    ['fees outstanding (sum)', `select sum(amount_due - amount_paid) from public.invoices where deleted_at is null`, 250],
    ['today’s attendance', `select student_id, status from public.attendance where session_date = current_date`, 250],
  ],
  parent: [
    ['children’s invoices', `select id, amount_due, amount_paid, status, due_date from public.invoices`, 25],
    ['children’s memorisation', `select * from public.hifz_progress`, 25],
    ['children’s attendance, 30 days', `select * from public.attendance where session_date > current_date - 30`, 25],
  ],
  student: [
    ['own memorisation', `select * from public.hifz_progress`, 25],
    ['own attendance', `select * from public.attendance`, 25],
  ],
};

const lit = (s) => `'${s.replace(/'/g, "''")}'`;

function measureBlock(users) {
  const parts = [];
  for (const [role, list] of Object.entries(QUERIES)) {
    if (!users[role]) continue;
    for (const [label, q] of list) {
      parts.push(`r := r || jsonb_build_object(${lit(`${role}|${label}`)}, pg_temp.perf_measure(${users[role]}, ${lit(q)}));`);
    }
  }
  if (users.admin) {
    parts.push(`r := r || jsonb_build_object('admin|madrasa summaries', pg_temp.perf_measure(${users.admin}, 'select * from public.admin_madrasa_summaries()'));`);
    parts.push(`r := r || jsonb_build_object('admin|platform overview', pg_temp.perf_measure(${users.admin}, 'select public.admin_platform_overview()'));`);
  }
  return parts.join('\n    ');
}

let failures = 0;
function report(title, result) {
  console.log(`\n${title}`);
  const budgets = Object.fromEntries(
    Object.entries(QUERIES).flatMap(([role, list]) => list.map(([label, , b]) => [`${role}|${label}`, b])),
  );
  budgets['admin|madrasa summaries'] = 500;
  budgets['admin|platform overview'] = 500;
  for (const [key, ms] of Object.entries(result)) {
    const [role, label] = key.split('|');
    const budget = budgets[key];
    const ok = Number(ms) <= budget;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${`${role}: ${label}`.padEnd(42)} ${Number(ms).toFixed(2).padStart(8)} ms   (budget ${budget})`);
  }
}

// ------------------------------------------------------------------ today
const people = await sql(`
  select (select id from public.profiles where email = 'owner@annur.example') as owner,
         (select id from public.profiles where email = 'parent@example.com') as parent,
         (select p.id from public.profiles p join public.students s on s.profile_id = p.id
           where p.email = 'dm-2025-0001@annur.example') as student`);
const u = Object.fromEntries(Object.entries(people[0]).map(([k, v]) => [k, v ? `${lit(v)}::uuid` : null]));

const today = await sql(`
  begin;
  ${MEASURE}
  do $$ declare r jsonb := '{}'; begin
    ${measureBlock(u)}
    perform set_config('perf.result', r::text, true);
  end $$;
  select current_setting('perf.result') as result;
  rollback;`);
report('today — the seeded school, as its real users (server execution time, median of 5)', JSON.parse(today[0].result));

// ------------------------------------------------------------------ scale
console.log(`\nbuilding a synthetic school of ${PUPILS} pupils inside a rolled-back transaction…`);
const t0 = Date.now();
const scale = await sql(`
  begin;
  ${MEASURE}
  do $$
  declare
    v_m uuid := gen_random_uuid(); v_owner uuid := gen_random_uuid(); v_admin uuid := gen_random_uuid();
    v_mum uuid := gen_random_uuid(); v_parent uuid; v_class uuid := gen_random_uuid();
    v_struct uuid := gen_random_uuid(); v_pupil uuid; r jsonb := '{}';
  begin
    create temp table perf_pupils on commit drop as
      select gen_random_uuid() as profile_id, g from generate_series(1, ${PUPILS}) g;

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
      from (select profile_id as id, 'perf-' || g || '@example.test' as e from perf_pupils
            union all values (v_owner, 'perf-owner@example.test'), (v_admin, 'perf-admin@example.test'),
                             (v_mum, 'perf-mum@example.test')) t(id, e);

    insert into public.profiles (id, role, madrasa_id, full_name, email)
    select profile_id, 'student', null, 'Perf Pupil ' || g, 'perf-' || g || '@example.test' from perf_pupils
    union all values (v_owner, 'teacher'::public.user_role, null::uuid, 'Perf Owner', 'perf-owner@example.test'),
                     (v_admin, 'admin', null, 'Perf Admin', 'perf-admin@example.test'),
                     (v_mum, 'parent', null, 'Perf Mum', 'perf-mum@example.test');
    update public.profiles set is_platform_admin = true where id = v_admin;

    insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
    values (v_m, 'Perf Madrasa', 'perf-' || substr(v_m::text, 1, 8), 'Garissa', 'Garissa', v_owner,
            'perf-owner@example.test', '+254712000001', 'active');
    update public.profiles set madrasa_id = v_m where id <> v_admin and email like 'perf-%@example.test';

    insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status)
    values (v_owner, v_m, 'EMP-PERF', true, 'active');
    -- Classes of 40, as a real school would have.
    create temp table perf_classes on commit drop as
      select gen_random_uuid() as id, c from generate_series(0, (${PUPILS} - 1) / 40) c;
    insert into public.classes (id, madrasa_id, name, level, capacity)
    select id, v_m, 'Perf Hifz ' || c, 'Level 1', 40 from perf_classes;
    select id into v_class from perf_classes where c = 0;

    insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
    select p.profile_id, v_m, extract(year from now())::int, date '2014-01-01',
           case when p.g % 2 = 0 then 'male' else 'female' end, c.id
      from perf_pupils p join perf_classes c on c.c = (p.g - 1) / 40;

    insert into public.fee_structures (id, madrasa_id, name, amount, currency, applies_to, term, academic_year)
    values (v_struct, v_m, 'Perf Term', 1500, 'KES', 'all', 'Term 3', 2026);
    insert into public.invoices (madrasa_id, student_id, invoice_no, fee_structure_id, description, amount_due,
                                 amount_paid, currency, due_date, status, issued_at)
    select v_m, s.id, 'PERF-' || s.id || '-' || k, v_struct, 'perf', 1500, case when k = 1 then 1500 else 0 end,
           'KES', current_date + k * 30, case when k = 1 then 'paid' else 'issued' end::public.invoice_status, now()
      from public.students s cross join generate_series(1, 3) k where s.madrasa_id = v_m;

    insert into public.attendance (madrasa_id, class_id, student_id, session_date, status)
    select v_m, s.class_id, s.id, current_date - d, case when (d + s.admission_year) % 7 = 0 then 'absent' else 'present' end::public.attendance_status
      from public.students s cross join generate_series(0, 19) d where s.madrasa_id = v_m;

    insert into public.hifz_progress (student_id, madrasa_id, surah_no, ayah_no, juz_no, status)
    select s.id, v_m, 114 - k, 1, 30, 'memorised' from public.students s cross join generate_series(0, 4) k
     where s.madrasa_id = v_m;

    insert into public.parents (profile_id, madrasa_id) values (v_mum, v_m) returning id into v_parent;
    insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
    select v_parent, s.id, v_m, 'mother', 'approved' from public.students s where s.madrasa_id = v_m limit 3;
    select s.profile_id into v_pupil from public.students s where s.madrasa_id = v_m limit 1;

    analyze public.students, public.invoices, public.attendance, public.hifz_progress, public.parent_student_links;

    ${measureBlock({ owner: 'v_owner', parent: 'v_mum', student: 'v_pupil', admin: 'v_admin' })}
    perform set_config('perf.result', r::text, true);
  end $$;
  select current_setting('perf.result') as result;
  rollback;`);
console.log(`  (fixture built, measured and rolled back in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
report(`scale — ${PUPILS} pupils, ${PUPILS * 3} invoices, ${PUPILS * 20} attendance rows, ${PUPILS * 5} memorisation rows`, JSON.parse(scale[0].result));

console.log(failures ? `\n✗ ${failures} query(ies) over budget.` : '\n✓ Every query within budget.');
process.exit(failures ? 1 : 0);

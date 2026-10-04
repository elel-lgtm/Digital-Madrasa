-- Verifies migration 0031: the mistake map counts assessed findings in the
-- teacher's own madrasa only, leaves out dismissed findings and unassessed
-- recordings, and is refused to pupils. Runs inside a transaction that rolls back.
--
--   npm run db:verify:heatmap

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_p1 uuid := gen_random_uuid();
  v_p2 uuid := gen_random_uuid();
  v_p3 uuid := gen_random_uuid();
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_rec uuid;
  r record;
  v_n int;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'hm-owner@example.test'), (v_owner2, 'hm-owner2@example.test'),
                 (v_p1, 'hm-p1@example.test'), (v_p2, 'hm-p2@example.test'), (v_p3, 'hm-p3@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'HM Owner', 'hm-owner@example.test'),
    (v_owner2, 'teacher', null, 'HM Other Owner', 'hm-owner2@example.test'),
    (v_p1, 'student', null, 'HM One', 'hm-p1@example.test'),
    (v_p2, 'student', null, 'HM Two', 'hm-p2@example.test'),
    (v_p3, 'student', null, 'HM Elsewhere', 'hm-p3@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'HM Madrasa', 'hm-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'hm-owner@example.test', '+254712000031', 'active'),
    (v_other, 'HM Other', 'hm-' || substr(v_other::text, 1, 8), 'Mombasa', 'Mombasa', v_owner2, 'hm-owner2@example.test', '+254712000032', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_p1, v_p2);
  update public.profiles set madrasa_id = v_other where id in (v_owner2, v_p3);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-HM1', true, 'active'), (v_owner2, v_other, 'EMP-HM2', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_p1, v_ma, extract(year from now())::int, date '2012-01-01', 'male') returning id into v_s1;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_p2, v_ma, extract(year from now())::int, date '2012-01-01', 'female') returning id into v_s2;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_p3, v_other, extract(year from now())::int, date '2012-01-01', 'male') returning id into v_s3;

  -- pupil one: two findings on 112:2 (ghunnah) and one on 112:3 (madd)
  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms, surah_no, ayah_from, ayah_to, qiraah_style)
  values (v_s1, v_ma, 'madrasa/' || v_ma || '/recitations/a', 1000, 112, 1, 4, 'hafs') returning id into v_rec;
  insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, errors, assessment, model_version, processing_ms)
  values (v_rec, v_ma, 70, '[{"surahNo":112,"ayahNo":2,"wordIndex":0,"rule":"ghunnah","severity":"minor","note":""},
                             {"surahNo":112,"ayahNo":3,"wordIndex":1,"rule":"madd","severity":"major","note":""}]', 'assessed', 'm', 1);
  -- pupil two: 112:2 ghunnah again, plus one the teacher dismissed
  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms, surah_no, ayah_from, ayah_to, qiraah_style)
  values (v_s2, v_ma, 'madrasa/' || v_ma || '/recitations/b', 1000, 112, 1, 4, 'hafs') returning id into v_rec;
  insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, errors, assessment, model_version, processing_ms, teacher_override)
  values (v_rec, v_ma, 80, '[{"surahNo":112,"ayahNo":1,"wordIndex":0,"rule":"qalqalah","severity":"minor","note":""},
                             {"surahNo":112,"ayahNo":2,"wordIndex":0,"rule":"ghunnah","severity":"minor","note":""}]', 'assessed', 'm', 1,
          '{"overallScore":85,"remarks":"","dismissedErrorIndexes":[0]}');
  -- pupil two again: not assessed, so nothing counts
  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms, surah_no, ayah_from, ayah_to, qiraah_style)
  values (v_s2, v_ma, 'madrasa/' || v_ma || '/recitations/c', 1000, 112, 1, 4, 'hafs') returning id into v_rec;
  insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, errors, assessment, model_version, processing_ms)
  values (v_rec, v_ma, null, '[{"surahNo":112,"ayahNo":4,"wordIndex":0,"rule":"madd","severity":"minor","note":""}]', 'unavailable', 'none', 0);
  -- another madrasa's pupil
  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms, surah_no, ayah_from, ayah_to, qiraah_style)
  values (v_s3, v_other, 'madrasa/' || v_other || '/recitations/d', 1000, 112, 1, 4, 'hafs') returning id into v_rec;
  insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, errors, assessment, model_version, processing_ms)
  values (v_rec, v_other, 60, '[{"surahNo":112,"ayahNo":2,"wordIndex":0,"rule":"ghunnah","severity":"minor","note":""}]', 'assessed', 'm', 1);

  set local role authenticated;

  -- 1. a pupil is refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_p1::text, 'role', 'authenticated')::text, true);
  begin
    perform * from public.tajweed_heatmap(90);
    v_failed := v_failed || text 'pupil saw the mistake map';
  exception when insufficient_privilege then raise notice 'PASS  pupil refused'; end;

  -- 2. the teacher sees their own madrasa only
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  select * into r from public.tajweed_heatmap(90) h where h.surah_no = 112 and h.ayah_no = 2 and h.rule = 'ghunnah';
  if r.mistakes is distinct from 2 or r.students is distinct from 2 then
    v_failed := v_failed || format('112:2 ghunnah counted %s / %s, expected 2 / 2', r.mistakes, r.students);
  else raise notice 'PASS  findings counted across pupils, other madrasa left out'; end if;

  -- 3. dismissed findings and unassessed recordings are left out
  select count(*) into v_n from public.tajweed_heatmap(90) h where h.ayah_no in (1, 4);
  if v_n <> 0 then v_failed := v_failed || text 'dismissed or unassessed finding counted';
  else raise notice 'PASS  dismissed and unassessed findings left out'; end if;

  select count(*) into v_n from public.tajweed_heatmap(90);
  if v_n <> 2 then v_failed := v_failed || format('expected 2 cells, got %s', v_n);
  else raise notice 'PASS  exactly the expected cells'; end if;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nMistake map rules hold.';
end $$;

rollback;

-- Verifies migration 0039: a parent can message their child's teacher and
-- the teacher can answer; each sees the other as the counterpart; nobody can
-- message a stranger. Runs inside a transaction that rolls back.
--
--   npm run db:verify:messaging

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_class uuid; v_student uuid; v_mum_row uuid; v_teacher_row uuid;
  v_thread uuid;
  r record;
  v_n int;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'mg-owner@example.test'), (v_mum, 'mg-mum@example.test'),
                 (v_stranger, 'mg-stranger@example.test'), (v_pupil, 'mg-pupil@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'Ustadh MG', 'mg-owner@example.test'),
    (v_mum, 'parent', null, 'MG Mum', 'mg-mum@example.test'),
    (v_stranger, 'parent', null, 'MG Stranger', 'mg-stranger@example.test'),
    (v_pupil, 'student', null, 'MG Pupil', 'mg-pupil@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
  values (v_ma, 'MG Madrasa', 'mg-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'mg-owner@example.test', '+254712000099', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values (v_owner, v_ma, 'EMP-MG1', true, 'active') returning id into v_teacher_row;
  insert into public.classes (madrasa_id, name, level, capacity, teacher_id) values (v_ma, 'MG Class', 'Level 1', 20, v_teacher_row) returning id into v_class;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_pupil, v_ma, extract(year from now())::int, date '2013-01-01', 'male', v_class) returning id into v_student;
  select id into v_mum_row from public.parents where profile_id = v_mum;
  if v_mum_row is null then insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_mum_row; end if;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
  values (v_mum_row, v_student, v_ma, 'mother', 'approved');
  if not exists (select 1 from public.parents where profile_id = v_stranger) then
    insert into public.parents (profile_id) values (v_stranger);
  end if;

  set local role authenticated;

  -- 1. the parent sees the teacher as a contact and writes first
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.message_contacts() where profile_id = v_owner and student_id = v_student;
  if v_n <> 1 then v_failed := v_failed || text 'parent cannot see the teacher as a contact'; end if;
  insert into public.message_threads (madrasa_id, student_id, participant_a, participant_b)
  values (v_ma, v_student, v_mum, v_owner) returning id into v_thread;
  insert into public.messages (madrasa_id, thread_id, sender_id, recipient_id, body)
  values (v_ma, v_thread, v_mum, v_owner, 'Assalamu alaikum, how is my son doing?');
  select * into r from public.my_threads();
  if r.counterpart_id <> v_owner or r.counterpart_name <> 'Ustadh MG' or r.student_name <> 'MG Pupil' then
    v_failed := v_failed || text 'parent''s thread names the wrong person';
  else raise notice 'PASS  parent writes to their child''s teacher'; end if;

  -- 2. the teacher sees the parent, one unread message, and replies
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  select * into r from public.my_threads();
  if r.counterpart_id <> v_mum or r.unread <> 1 or r.last_message not like 'Assalamu%' then
    v_failed := v_failed || format('teacher thread wrong: %s %s', r.counterpart_name, r.unread);
  else raise notice 'PASS  teacher sees the parent and the unread message'; end if;
  insert into public.messages (madrasa_id, thread_id, sender_id, recipient_id, body)
  values (v_ma, v_thread, v_owner, v_mum, 'Wa alaikum salam, he is doing well.');
  raise notice 'PASS  teacher replies';

  -- 3. a stranger cannot write to the teacher
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.message_contacts();
  if v_n <> 0 then v_failed := v_failed || text 'a stranger has contacts'; end if;
  begin
    insert into public.messages (madrasa_id, thread_id, sender_id, recipient_id, body)
    values (v_ma, v_thread, v_stranger, v_owner, 'Spam');
    v_failed := v_failed || text 'a stranger messaged the teacher';
  exception when insufficient_privilege then raise notice 'PASS  strangers cannot message'; end;

  -- 4. nobody can slip a message into someone else's conversation
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.messages (madrasa_id, thread_id, sender_id, recipient_id, body)
    values (v_ma, gen_random_uuid(), v_owner, v_mum, 'Wrong thread');
    v_failed := v_failed || text 'message accepted into a thread that is not theirs';
  exception when insufficient_privilege or foreign_key_violation then raise notice 'PASS  messages stay in their own thread'; end;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nMessaging rules hold.';
end $$;

rollback;

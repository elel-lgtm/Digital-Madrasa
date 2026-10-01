-- Verifies migration 0025 against the live schema: push tokens can only be
-- attached to your own account; the delivery queues are closed to clients;
-- claims never hand the same row out twice and skip stale notifications;
-- announcements reach exactly their audience; and a direct message notifies
-- its recipient without putting the message text in the notification. Runs
-- inside a transaction that rolls back (pg_net's queued requests included),
-- so it leaves nothing behind and sends nothing.
--
--   npm run db:verify:notifications

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_teach uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_student uuid;
  v_parent uuid;
  v_parent2 uuid;
  v_thread uuid := gen_random_uuid();
  v_ann uuid := gen_random_uuid();
  v_n int;
  v_ids1 uuid[];
  v_ids2 uuid[];
  r record;
  v_failed text[] := '{}';
begin
  -- ------------------------------------------------------------ fixtures
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'vn-owner@example.test'), (v_teach, 'vn-teach@example.test'),
                 (v_pupil, 'vn-pupil@example.test'), (v_mum, 'vn-mum@example.test'),
                 (v_pending, 'vn-pending@example.test')) t(id, e);

  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'VN Owner', 'vn-owner@example.test'),
    (v_teach, 'teacher', null, 'VN Teacher', 'vn-teach@example.test'),
    (v_pupil, 'student', null, 'VN Pupil', 'vn-pupil@example.test'),
    (v_mum, 'parent', null, 'VN Mum', 'vn-mum@example.test'),
    (v_pending, 'parent', null, 'VN Pending', 'vn-pending@example.test');

  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
  values (v_ma, 'VN Madrasa', 'vn-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner,
          'vn-owner@example.test', '+254712000001', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_teach, v_pupil, v_mum, v_pending);

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-VN1', true, 'active'),
    (v_teach, v_ma, 'EMP-VN2', false, 'active');

  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2014-01-01', 'female')
  returning id into v_student;

  insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_parent;
  insert into public.parents (profile_id, madrasa_id) values (v_pending, v_ma) returning id into v_parent2;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status) values
    (v_parent, v_student, v_ma, 'mother', 'approved'),
    (v_parent2, v_student, v_ma, 'guardian', 'pending');

  -- ------------------------------------------------ push tokens (as mum)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_mum then
    raise exception 'harness broken: acting as % / %', current_user, auth.uid();
  end if;

  -- 1. register through the function
  perform public.register_push_token('ExponentPushToken[vn-test-token-0001]', 'android');
  select count(*) into v_n from public.push_tokens where token = 'ExponentPushToken[vn-test-token-0001]';
  if v_n <> 1 then v_failed := v_failed || text 'own token not registered/visible';
  else raise notice 'PASS  a user registers their own device'; end if;

  -- 2. no direct writes, so no token can be put on someone else's account
  begin
    insert into public.push_tokens (user_id, token, platform)
    values (v_owner, 'ExponentPushToken[vn-test-token-0002]', 'android');
    v_failed := v_failed || text 'direct insert into push_tokens accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS  push_tokens cannot be written directly';
  end;

  -- 3. malformed tokens are refused
  begin
    perform public.register_push_token('not-a-token', 'android');
    v_failed := v_failed || text 'malformed token accepted';
  exception when check_violation then
    raise notice 'PASS  malformed token refused';
  end;

  -- 4. queues and claims are closed to clients
  begin
    perform count(*) from public.claim_notifications(10);
    v_failed := v_failed || text 'a client claimed notifications';
  exception when insufficient_privilege then
    raise notice 'PASS  a client cannot claim notifications';
  end;
  select count(*) into v_n from public.sms_outbox;
  if v_n <> 0 then v_failed := v_failed || text 'client can read sms_outbox';
  else raise notice 'PASS  sms_outbox unreadable to clients'; end if;
  begin
    perform public.request_notification_dispatch();
    v_failed := v_failed || text 'a client kicked the dispatcher';
  exception when insufficient_privilege then
    raise notice 'PASS  a client cannot kick the dispatcher';
  end;

  -- 5. the same phone signed in as someone else: the token moves
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.push_tokens;
  if v_n <> 0 then v_failed := v_failed || text 'owner can see mum''s token';
  else raise notice 'PASS  tokens are private to their account'; end if;
  perform public.register_push_token('ExponentPushToken[vn-test-token-0001]', 'android');

  -- 6. unregistering only ever removes your own
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  perform public.unregister_push_token('ExponentPushToken[vn-test-token-0001]');
  reset role;
  select user_id into r from public.push_tokens where token = 'ExponentPushToken[vn-test-token-0001]';
  if r.user_id is distinct from v_owner then
    v_failed := v_failed || format('token owner after move/unregister: %s', r.user_id);
  else raise notice 'PASS  token moved to the new account; old account cannot remove it'; end if;

  -- ------------------------------------------------------- announcements
  -- 6b. staff can post to parents alone and read it back (PostgREST RETURNING)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  insert into public.announcements (id, madrasa_id, author_id, title, body, audience)
  values (v_ann, v_ma, v_owner, 'VN Eid closure', 'Closed Monday.', array['parents', 'teachers'])
  returning id into v_ann;
  insert into public.announcements (madrasa_id, author_id, title, body, audience)
  values (v_ma, v_owner, 'VN parents only', 'Fees reminder.', array['parents'])
  returning id into r;
  raise notice 'PASS  staff post to parents only and read it back';
  -- 6c. a parent still cannot see an announcement meant for teachers only
  insert into public.announcements (madrasa_id, author_id, title, body, audience)
  values (v_ma, v_owner, 'VN staff only', 'Staff meeting.', array['teachers']);
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.announcements where title = 'VN staff only';
  if v_n <> 0 then v_failed := v_failed || text 'parent read a staff-only announcement';
  else raise notice 'PASS  staff-only announcement stays hidden from parents'; end if;
  reset role;

  -- 7. approved parent and other staff; not the author, not a pending parent, not the pupil
  select array_agg(user_id order by user_id) into v_ids1 from public.notifications
   where payload ->> 'announcement_id' = v_ann::text;
  if v_ids1 is distinct from (select array_agg(x order by x) from unnest(array[v_mum, v_teach]) x) then
    v_failed := v_failed || format('announcement recipients wrong: %s', v_ids1);
  else raise notice 'PASS  announcement reached exactly the approved parent and the other teacher'; end if;

  -- ------------------------------------------------------------ messages
  insert into public.message_threads (id, madrasa_id, participant_a, participant_b) values (v_thread, v_ma, v_teach, v_mum);
  insert into public.messages (madrasa_id, thread_id, sender_id, recipient_id, body)
  values (v_ma, v_thread, v_teach, v_mum, 'Private: about the fees');

  -- 8. recipient notified by push only, and the text stays out of it
  select * into r from public.notifications where user_id = v_mum and type = 'message';
  if r is null or r.channel <> array['push'] or r.body like '%fees%' or r.body not like 'VN Teacher%' then
    v_failed := v_failed || format('message notice wrong: %s / %s', r.channel, r.body);
  else raise notice 'PASS  message recipient notified by push, without the message text'; end if;

  -- ---------------------------------------------------------------- claims
  set local role service_role;
  update public.notifications set sent_at = now() where sent_at is null;  -- isolate from live rows
  insert into public.notifications (user_id, madrasa_id, type, title, body, channel, created_at) values
    (v_mum, v_ma, 'fee_due', 'VN one', 'b', array['in_app', 'push'], now()),
    (v_mum, v_ma, 'fee_due', 'VN two', 'b', array['email'], now()),
    (v_mum, v_ma, 'fee_due', 'VN in-app only', 'b', array['in_app'], now()),
    (v_mum, v_ma, 'fee_due', 'VN stale', 'b', array['push'], now() - interval '3 days');

  -- 9. two claims never overlap; in-app-only and stale rows are never claimed
  select array_agg(id) into v_ids1 from public.claim_notifications(1);
  select array_agg(id) into v_ids2 from public.claim_notifications(10);
  select count(*) into v_n from public.notifications where title in ('VN one', 'VN two') and sent_at is not null;
  if array_length(v_ids1, 1) <> 1 or array_length(v_ids2, 1) <> 1 or v_ids1 && v_ids2 or v_n <> 2
     or exists (select 1 from public.notifications where title in ('VN in-app only', 'VN stale') and sent_at is not null) then
    v_failed := v_failed || format('claims wrong: %s / %s', v_ids1, v_ids2);
  else raise notice 'PASS  claims are disjoint and skip in-app-only and stale rows'; end if;

  -- 10. outbox claims count attempts and back off
  insert into public.sms_outbox (madrasa_id, to_phone, body) values (v_ma, '+254712345678', 'VN sms');
  select attempts, scheduled_at > now() + interval '1 minute' as later into r from public.claim_sms(10);
  select count(*) into v_n from public.claim_sms(10);
  if r.attempts <> 1 or not r.later or v_n <> 0 then
    v_failed := v_failed || format('sms claim: attempts %s later %s reclaimed %s', r.attempts, r.later, v_n);
  else raise notice 'PASS  an outbox claim counts the attempt and backs off'; end if;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nNotification delivery rules hold.';
end $$;

rollback;

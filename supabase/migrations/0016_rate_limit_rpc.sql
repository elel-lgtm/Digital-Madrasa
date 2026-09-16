-- ===========================================================================
-- 0016 — Atomic rate-limit counter
-- ===========================================================================
--
-- `_shared/rate-limit.ts` calls this. Without it the limiter logs an error and
-- allows the request, so every limit in section 10.4 is currently decorative.
--
-- Counting has to be atomic. The obvious "select count, compare, update" is a
-- race: two requests arriving together both read the old count and both pass,
-- which is exactly the pattern an attacker produces. INSERT .. ON CONFLICT DO
-- UPDATE with the check inside the statement makes the increment and the
-- decision a single operation.
--
-- Returns true when the caller may proceed, false when the window is spent.
-- ===========================================================================

create or replace function public.consume_rate_limit(
  p_key          text,
  p_window_start timestamptz,
  p_limit        int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Callable only by the service role, which is what Edge Functions run as.
-- A user able to call this could burn their own budget, but more importantly
-- could probe which keys exist.
revoke all on function public.consume_rate_limit(text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, timestamptz, int) to service_role;

-- Old windows are dead weight; nothing reads a window once it has passed.
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.prune_rate_limits()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.rate_limits
     where window_start < now() - interval '2 days'
    returning 1
  )
  select count(*)::int from deleted;
$$;

comment on function public.consume_rate_limit is
  'Atomically increments a rate-limit window and reports whether the caller is still under the limit.';

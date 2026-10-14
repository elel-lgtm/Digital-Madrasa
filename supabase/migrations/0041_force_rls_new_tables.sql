-- 0041: force Row Level Security on the two newest tables.
--
-- Every other table has RLS enabled AND forced (0009, 0010), so even the
-- table owner goes through the policies. class_videos (0036) and
-- halaqa_readings (0037) were only enabled; this brings them in line.

alter table public.class_videos    force row level security;
alter table public.halaqa_readings force row level security;

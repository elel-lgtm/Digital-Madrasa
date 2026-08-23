-- ============================================================================
-- Digital Madrasa — 0001: extensions, enums and shared trigger helpers
-- ============================================================================
-- Every structural change to this database is a migration file. Nothing is
-- ever clicked in the dashboard, so the schema in git is the schema in prod.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_stat_statements";

-- ---------------------------------------------------------------- enums ---

create type public.user_role as enum ('student', 'teacher', 'parent', 'admin');

create type public.madrasa_status as enum (
  'active', 'suspended', 'pending_deletion', 'deleted'
);

create type public.enrollment_status as enum ('active', 'graduated', 'withdrawn');

create type public.link_status as enum ('pending', 'approved', 'rejected', 'revoked');

create type public.relationship_type as enum ('father', 'mother', 'guardian');

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

create type public.attendance_method as enum ('manual', 'qr');

create type public.assignment_type as enum (
  'memorisation', 'recitation', 'tajweed', 'written'
);

create type public.submission_status as enum ('pending', 'graded', 'returned');

create type public.hifz_status as enum (
  'not_started', 'learning', 'memorised', 'revising', 'mastered'
);

create type public.qiraah_style as enum ('hafs', 'warsh', 'qaloon', 'duri', 'shubah');

create type public.fee_scope as enum ('all', 'class', 'student');

create type public.invoice_status as enum (
  'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'
);

create type public.payment_method as enum ('mpesa', 'cash', 'bank', 'stripe');

create type public.payment_status as enum (
  'initiated', 'pending', 'success', 'failed', 'reversed'
);

create type public.mail_status as enum ('queued', 'sent', 'failed');

create type public.teacher_status as enum ('active', 'invited', 'suspended');

-- ------------------------------------------------------------- triggers ---

-- Keeps updated_at honest without trusting any client to send it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at server-side.';

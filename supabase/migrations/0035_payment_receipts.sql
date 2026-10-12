-- 0035: what a payment receipt shows.
--
-- payer_phone  the number the M-Pesa prompt went to, masked (07*****678)
--              before it is stored: a receipt needs to say which phone paid,
--              not the whole number.
-- is_test      true when no real money moved: the M-Pesa simulator or
--              sandbox, or a Paystack test key. Receipts say so, so a demo
--              receipt can never pass for a real one. Every payment made so
--              far was a test, hence the default.
--
-- Re-runnable.

alter table public.payments
  add column if not exists payer_phone text,
  add column if not exists is_test boolean not null default true;

alter table public.payments drop constraint if exists payments_payer_phone_masked;
alter table public.payments add constraint payments_payer_phone_masked
  check (payer_phone is null or payer_phone ~ '^0[0-9]\*{5}[0-9]{3}$');

comment on column public.payments.payer_phone is 'Masked payer number (07*****678); the full number is never stored.';
comment on column public.payments.is_test is 'True when no real money moved (simulator, sandbox or test key).';

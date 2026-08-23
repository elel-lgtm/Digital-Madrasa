-- ============================================================================
-- Digital Madrasa — 0006: recitations and tajweed evaluation
-- ============================================================================

create table public.recitations (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  madrasa_id    uuid not null references public.madrasas (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  -- Storage path inside the private bucket: madrasa/{madrasa_id}/recitations/{uuid}
  audio_url     text not null,
  duration_ms   int not null check (duration_ms > 0 and duration_ms <= 900000),
  surah_no      int not null check (surah_no between 1 and 114),
  ayah_from     int not null check (ayah_from >= 1),
  ayah_to       int not null check (ayah_to >= 1),
  qiraah_style  public.qiraah_style not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint recitations_range_ordered check (ayah_to >= ayah_from)
);

create table public.tajweed_feedback (
  id                     uuid primary key default gen_random_uuid(),
  recitation_id          uuid not null unique
                           references public.recitations (id) on delete cascade,
  madrasa_id             uuid not null references public.madrasas (id) on delete cascade,
  overall_score          numeric(5,2) not null check (overall_score between 0 and 100),
  -- [{surahNo, ayahNo, wordIndex, rule, severity, note}]
  errors                 jsonb not null default '[]'::jsonb,
  -- Stored on every row so results stay interpretable when the model changes.
  model_version          text not null,
  processing_ms          int not null check (processing_ms >= 0),
  reviewed_by_teacher_id uuid references public.teachers (id) on delete set null,
  -- The teacher's assessment is final; this is what the report card shows.
  teacher_override       jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create table public.certificates (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  madrasa_id        uuid not null references public.madrasas (id) on delete cascade,
  kind              text not null check (
                      kind in ('juz_completion', 'quran_completion', 'tajweed_level')
                    ),
  title             text not null,
  issued_at         timestamptz not null default now(),
  -- Printed on the PDF and checkable at /verify/{code} without signing in.
  verification_code text not null unique,
  pdf_url           text,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index recitations_student_idx on public.recitations (student_id, created_at desc)
  where deleted_at is null;
create index recitations_madrasa_idx on public.recitations (madrasa_id, created_at desc)
  where deleted_at is null;
create index tajweed_madrasa_idx     on public.tajweed_feedback (madrasa_id, created_at desc);
create index tajweed_review_idx      on public.tajweed_feedback (madrasa_id)
  where reviewed_by_teacher_id is null;
create index certificates_student_idx on public.certificates (student_id);

create trigger trg_recitations_updated_at before update on public.recitations
  for each row execute function public.set_updated_at();
create trigger trg_tajweed_updated_at     before update on public.tajweed_feedback
  for each row execute function public.set_updated_at();

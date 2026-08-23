-- ============================================================================
-- Digital Madrasa — 0005: lessons, assignments, attendance, grades, hifz
-- ============================================================================

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  madrasa_id    uuid not null references public.madrasas (id) on delete cascade,
  class_id      uuid not null references public.classes (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 3 and 120),
  surah_from    int not null check (surah_from between 1 and 114),
  ayah_from     int not null check (ayah_from >= 1),
  surah_to      int not null check (surah_to between 1 and 114),
  ayah_to       int not null check (ayah_to >= 1),
  qiraah_style  public.qiraah_style not null default 'hafs',
  resource_urls text[] not null default '{}',
  notes         text,
  scheduled_for timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- Ranges are ordered. Checked here as well as in the shared Zod schema.
  constraint lessons_range_ordered check (
    surah_to > surah_from or (surah_to = surah_from and ayah_to >= ayah_from)
  )
);

create table public.assignments (
  id              uuid primary key default gen_random_uuid(),
  madrasa_id      uuid not null references public.madrasas (id) on delete cascade,
  class_id        uuid not null references public.classes (id) on delete cascade,
  lesson_id       uuid references public.lessons (id) on delete set null,
  title           text not null check (length(btrim(title)) between 3 and 120),
  instructions    text not null,
  assignment_type public.assignment_type not null,
  due_at          timestamptz not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  madrasa_id    uuid not null references public.madrasas (id) on delete cascade,
  audio_url     text,
  text_body     text,
  submitted_at  timestamptz not null default now(),
  status        public.submission_status not null default 'pending',
  score         numeric(5,2) check (score is null or score >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (assignment_id, student_id)
);

create table public.hifz_progress (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  madrasa_id        uuid not null references public.madrasas (id) on delete cascade,
  surah_no          int not null check (surah_no between 1 and 114),
  ayah_no           int not null check (ayah_no >= 1),
  juz_no            int not null check (juz_no between 1 and 30),
  status            public.hifz_status not null default 'not_started',
  confidence_score  numeric(3,2) check (confidence_score between 0 and 1),
  last_revised_at   timestamptz,
  -- Produced by the SM-2 style scheduler; drives "Today's revision".
  next_review_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (student_id, surah_no)
);

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  madrasa_id   uuid not null references public.madrasas (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  session_date date not null,
  status       public.attendance_status not null,
  method       public.attendance_method not null default 'manual',
  note         text,
  marked_by    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (student_id, session_date)
);

create table public.grades (
  id         uuid primary key default gen_random_uuid(),
  madrasa_id uuid not null references public.madrasas (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  class_id   uuid not null references public.classes (id) on delete cascade,
  term       text not null,
  subject    text not null,
  score      numeric(6,2) not null check (score >= 0),
  max_score  numeric(6,2) not null check (max_score > 0),
  remarks    text,
  issued_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint grades_score_within_max check (score <= max_score)
);

create index lessons_madrasa_idx     on public.lessons (madrasa_id, created_at desc)
  where deleted_at is null;
create index lessons_class_idx       on public.lessons (class_id);
create index assignments_madrasa_idx on public.assignments (madrasa_id, due_at desc)
  where deleted_at is null;
create index assignments_class_idx   on public.assignments (class_id);
create index submissions_assignment_idx on public.submissions (assignment_id);
create index submissions_student_idx  on public.submissions (student_id);
create index hifz_student_idx         on public.hifz_progress (student_id);
create index hifz_review_idx          on public.hifz_progress (next_review_at)
  where deleted_at is null;
create index attendance_class_date_idx on public.attendance (class_id, session_date desc);
create index attendance_student_idx    on public.attendance (student_id, session_date desc);
create index grades_student_idx        on public.grades (student_id, created_at desc)
  where deleted_at is null;
create index grades_class_idx          on public.grades (class_id);

create trigger trg_lessons_updated_at     before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger trg_assignments_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();
create trigger trg_submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();
create trigger trg_hifz_updated_at        before update on public.hifz_progress
  for each row execute function public.set_updated_at();
create trigger trg_attendance_updated_at  before update on public.attendance
  for each row execute function public.set_updated_at();
create trigger trg_grades_updated_at      before update on public.grades
  for each row execute function public.set_updated_at();

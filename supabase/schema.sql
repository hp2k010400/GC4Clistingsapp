-- ============================================================
-- GC4C Listings App — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Profiles (one row per user, linked to auth.users)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  location   text not null check (location in ('Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton')),
  role       text not null default 'employee' check (role in ('employee', 'manager')),
  created_at timestamptz default now()
);

-- Daily time sessions (one per employee per day)
create table public.daily_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  start_time  time,
  lunch_time  time,
  finish_time time,
  created_at  timestamptz default now(),
  unique (user_id, date)
);

-- Individual listings
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  date            date not null,
  serial_id       text not null,
  photos_comments text,
  metafields      boolean not null default false,
  title           boolean not null default false,
  price           boolean not null default false,
  photographs     boolean not null default false,
  specifications  boolean not null default false,
  condition       boolean not null default false,
  created_at      timestamptz default now()
);

-- Indexes for common query patterns
create index on public.listings (user_id, date);
create index on public.listings (date);
create index on public.daily_sessions (user_id, date);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.daily_sessions enable row level security;
alter table public.listings       enable row level security;

-- Helper: is the current user a manager?
create or replace function public.is_manager()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

-- profiles: users see their own row; managers see all
create policy "Own profile" on public.profiles
  for select using (auth.uid() = id or public.is_manager());

create policy "Insert own profile via service role" on public.profiles
  for insert with check (true);  -- service role only in practice

-- daily_sessions: employees manage their own; managers read all
create policy "Employee sessions" on public.daily_sessions
  for all using (auth.uid() = user_id or public.is_manager());

-- listings: employees manage their own; managers read all
create policy "Employee listings" on public.listings
  for all using (auth.uid() = user_id or public.is_manager());

-- ============================================================
-- Batches (one per bag of clubs)
-- ============================================================

create table public.batches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  date       date not null default current_date,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  comments   text,
  photo_urls text[],
  created_at timestamptz not null default now()
);

alter table public.batches enable row level security;

create policy "Employee batches"
  on public.batches for all
  using (auth.uid() = user_id or public.is_manager())
  with check (auth.uid() = user_id);

grant all on public.batches to anon, authenticated, service_role;
create index on public.batches (user_id, date);

-- Add batch_id and serial_id_checked to listings
alter table public.listings
  add column if not exists batch_id uuid references public.batches(id) on delete set null,
  add column if not exists serial_id_checked boolean not null default false;

-- ============================================================
-- Time away notes (employee log of unexplained time away from listing)
-- ============================================================

create table public.time_away_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  date       date not null default current_date,
  comment    text not null,
  created_at timestamptz not null default now()
);

alter table public.time_away_notes enable row level security;

create policy "Employee time away notes"
  on public.time_away_notes for all
  using (auth.uid() = user_id or public.is_manager())
  with check (auth.uid() = user_id);

grant all on public.time_away_notes to anon, authenticated, service_role;
create index on public.time_away_notes (user_id, date);

-- ============================================================
-- Your first manager account
-- ============================================================
-- After creating your own Supabase Auth user (via the Auth tab),
-- run this to give yourself the manager role:
--
--   insert into public.profiles (id, full_name, location, role)
--   values ('<your-auth-user-id>', 'Harry Phillips', 'Edinburgh', 'manager');
--
-- Then use the "+ Add Employee" button in the app to create employee accounts.
-- ============================================================

-- ============================================================
-- Specs Guide (phase 1 — Irons only, beta-gated to specific users)
-- ============================================================
-- Replaces Martin Lord's "Master Spec Guide" Excel workbook. A model
-- (spec_models) can have one or more loft/length variants (spec_variants) —
-- Irons (sets) always has exactly one variant per model with loft = null,
-- but Drivers/Fairways/Hybrids/Single Irons/Wedges (not yet migrated) need
-- multiple variants per model, hence the split from the start.

alter table public.profiles
  add column if not exists specs_guide_beta boolean not null default false;

create table public.spec_models (
  id          uuid primary key default gen_random_uuid(),
  club_type   text not null check (club_type in ('drivers', 'fairways', 'hybrids', 'single_irons', 'irons', 'wedges')),
  brand       text,
  model_name  text not null,
  year        int,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

create table public.spec_variants (
  id             uuid primary key default gen_random_uuid(),
  model_id       uuid not null references public.spec_models(id) on delete cascade,
  loft           text,
  mens_length    text,
  womens_length  text,
  notes          text,
  created_at     timestamptz not null default now()
);

create index on public.spec_models (club_type);
create index on public.spec_models (brand);
create index on public.spec_variants (model_id);

alter table public.spec_models   enable row level security;
alter table public.spec_variants enable row level security;

create or replace function public.has_specs_guide_access()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and specs_guide_beta = true
  );
$$;

create policy "Specs guide access" on public.spec_models
  for all using (public.has_specs_guide_access()) with check (public.has_specs_guide_access());

create policy "Specs guide access" on public.spec_variants
  for all using (public.has_specs_guide_access()) with check (public.has_specs_guide_access());

grant all on public.spec_models, public.spec_variants to authenticated, service_role;

-- Give yourself beta access (run after finding your own auth user id):
--
--   update public.profiles set specs_guide_beta = true where id = '<your-auth-user-id>';
--
-- Then run supabase/seed_specs_irons.sql to load the migrated Irons (sets) data.
-- ============================================================

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

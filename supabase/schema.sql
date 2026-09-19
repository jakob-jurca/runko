-- =============================================================
-- Runko — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL).
-- =============================================================

-- Profile row per auth user. Created by the app at onboarding completion.
-- trial_end default implements the 1-month free trial.
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  age int check (age between 10 and 100),
  weight numeric check (weight between 30 and 250),
  goal text check (goal in ('event', 'general')),
  fitness_level text check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  event_name text, -- legacy: superseded by target_distance_km
  event_date date,
  -- The goal is a DISTANCE IN KM (5, 10, 15, 21.1, 30, 42.2 … any number),
  -- with an optional date and an optional target time in MINUTES.
  target_distance_km numeric,
  target_time_min numeric,
  -- Plan-creation input: where the runner is starting from, and when they
  -- can actually train. available_days holds 'Monday' … 'Sunday'.
  experience_months int,
  weekly_volume_km numeric,
  longest_run_km numeric,
  days_per_week int,
  available_days text[],
  -- free-text "tell your coach anything else" from thorough onboarding
  coach_notes text,
  -- when the current training plan was generated; rebuilding is limited to
  -- once per month, counted from here. null = never built one (e.g. the
  -- runner skipped onboarding), so the first build is always allowed.
  last_plan_created_at timestamptz,
  trial_end timestamptz not null default (now() + interval '1 month'),
  -- subscription skeleton: flipped to 'active' by a future Stripe webhook
  subscription_status text not null default 'trial',
  created_at timestamptz not null default now()
);

-- Migration for databases created before onboarding v2 (safe to re-run).
alter table public.users add column if not exists age int;
alter table public.users add column if not exists weight numeric;
alter table public.users add column if not exists coach_notes text;
-- Onboarding v3: skippable onboarding + once-a-month plan rebuild limit.
alter table public.users add column if not exists last_plan_created_at timestamptz;
-- v4: distance-based goals + richer plan-creation input.
alter table public.users add column if not exists target_distance_km numeric;
alter table public.users add column if not exists target_time_min numeric;
alter table public.users add column if not exists experience_months int;
alter table public.users add column if not exists weekly_volume_km numeric;
alter table public.users add column if not exists longest_run_km numeric;
alter table public.users add column if not exists days_per_week int;
alter table public.users add column if not exists available_days text[];

-- Skippable onboarding means a profile row can exist before the runner has
-- chosen a goal or a level, so those columns must accept NULL. (A CHECK
-- constraint already passes on NULL; this only relaxes older NOT NULLs.)
alter table public.users alter column goal drop not null;
alter table public.users alter column fitness_level drop not null;

-- One row per user per training week; plan_json holds the 7-day structure.
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_number int not null,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_number)
);

-- Logged runs. source supports future integrations:
-- 'manual' | 'strava' | 'garmin' | 'healthkit'
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null default current_date,
  distance numeric,
  duration numeric,
  effort int check (effort between 1 and 5),
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

-- Durable facts the coach remembers about a runner, extracted from chat.
-- Not a transcript: only things that stay true (a recurring niggle, "mornings
-- only", monthly work travel). Injected into every coach prompt.
create table if not exists public.coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  content text not null,
  category text not null check (
    category in ('injury', 'schedule', 'preference', 'life_context', 'goal_change')
  ),
  created_at timestamptz not null default now(),
  -- bumped when the fact is actually used, so stale ones can be retired later
  last_referenced_at timestamptz
);

-- AI coach chat history.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security: users can only touch their own rows ----------

alter table public.users enable row level security;
alter table public.training_plans enable row level security;
alter table public.workouts enable row level security;
alter table public.chat_messages enable row level security;
alter table public.coach_memory enable row level security;

create policy "own profile" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own plans" on public.training_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own workouts" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own chat" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own memory" on public.coach_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful indexes for the dashboard queries.
create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);
create index if not exists chat_user_created_idx on public.chat_messages (user_id, created_at);
create index if not exists memory_user_created_idx on public.coach_memory (user_id, created_at desc);

-- Backfill: existing users already have a plan, so start their monthly clock
-- from when that plan was created rather than letting them rebuild twice.
update public.users u
   set last_plan_created_at = p.created_at
  from (
    select user_id, min(created_at) as created_at
      from public.training_plans
     group by user_id
  ) p
 where p.user_id = u.id
   and u.last_plan_created_at is null;

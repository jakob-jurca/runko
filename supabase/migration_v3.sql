-- =============================================================
-- Runko — migration v3
-- Paste into the Supabase SQL Editor and run once.
--
-- NEW STATEMENTS ONLY. Existing tables, policies and indexes are not
-- re-issued, because CREATE POLICY has no IF NOT EXISTS and would error on
-- a database that already has them.
--
-- Everything here is idempotent, so re-running is safe.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. users — new columns
-- ---------------------------------------------------------------

-- When the current training plan was generated. Rebuilding a plan is limited
-- to once a month, counted from here. NULL = never built one (e.g. the runner
-- skipped onboarding), so their first build is always allowed.
alter table public.users add column if not exists last_plan_created_at timestamptz;

-- Onboarding is now skippable, so a profile row can exist before the runner
-- has chosen a goal or a fitness level. Those columns must accept NULL.
-- (No-ops if they were already nullable.)
alter table public.users alter column goal drop not null;
alter table public.users alter column fitness_level drop not null;

-- ---------------------------------------------------------------
-- 2. coach_memory — new table
-- ---------------------------------------------------------------

-- Durable facts the coach remembers about a runner, extracted from chat.
-- Not a transcript: only things that stay true (a recurring niggle, "mornings
-- only", monthly work travel). Injected into every coach prompt and used by
-- the plan engine as scheduling constraints.
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

alter table public.coach_memory enable row level security;

-- New table, so this policy cannot already exist. Guarded anyway in case this
-- migration is run twice.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'coach_memory' and policyname = 'own memory'
  ) then
    create policy "own memory" on public.coach_memory
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists memory_user_created_idx
  on public.coach_memory (user_id, created_at desc);

-- ---------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------

-- Existing users already have a plan, so start their monthly rebuild clock
-- from when that plan was created rather than granting them a free extra one.
update public.users u
   set last_plan_created_at = p.created_at
  from (
    select user_id, min(created_at) as created_at
      from public.training_plans
     group by user_id
  ) p
 where p.user_id = u.id
   and u.last_plan_created_at is null;

-- ---------------------------------------------------------------
-- Note: training_plans needs NO schema change. The richer plan shape
-- (phase, is_recovery, intent, target_volume_km, vdot, paces, and the new
-- per-day pace / purpose / intensity fields) all lives inside the existing
-- plan_json jsonb column.
-- ---------------------------------------------------------------

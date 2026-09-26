-- =============================================================
-- Runko — migration v7 (safety questions and the health profile)
-- Paste into the Supabase SQL Editor and run once.
--
-- NEW STATEMENTS ONLY. Existing tables and policies are not re-issued.
-- Everything here is idempotent.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. The safety questions onboarding asks (users row)
-- ---------------------------------------------------------------
--
-- Health data is a GDPR special category, so onboarding asks ONLY what the
-- plan engine needs to keep a runner safe (core/planning/gate.js):
--
--   pregnancy_status  none | pregnant | postpartum — no plan is built
--                     during pregnancy; postpartum returns are gated by weeks
--   weeks_postpartum  weeks since birth, only when postpartum
--   pain_at_rest      pain at rest or while walking — no running plan
--   break_days        days since they last ran regularly (a band's upper end)
--   injury_last_12m   a running injury in the last 12 months
--
-- Everything else lives in the optional health_profiles table below.

alter table public.users add column if not exists pregnancy_status text
  check (pregnancy_status in ('none', 'pregnant', 'postpartum'));
alter table public.users add column if not exists weeks_postpartum int
  check (weeks_postpartum between 0 and 104);
alter table public.users add column if not exists pain_at_rest boolean;
alter table public.users add column if not exists break_days int
  check (break_days between 0 and 3650);
alter table public.users add column if not exists injury_last_12m boolean;

-- migration_v6 made users writable column by column; new columns must be
-- granted or onboarding's save fails with a 403.
grant insert (pregnancy_status, weeks_postpartum, pain_at_rest, break_days, injury_last_12m)
  on public.users to authenticated;
grant update (pregnancy_status, weeks_postpartum, pain_at_rest, break_days, injury_last_12m)
  on public.users to authenticated;

-- ---------------------------------------------------------------
-- 2. The optional health profile ("Zdravstveni profil" in Settings)
-- ---------------------------------------------------------------
--
-- One row per runner, created only after they accept the consent line
-- (consent_at is required), deleted with one call from Settings, and
-- deleted automatically with the account. Only what the engine reads is
-- stored: no free text, no diagnoses beyond yes/no flags.

create table if not exists public.health_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  consent_at timestamptz not null,
  sex text check (sex in ('female', 'male')),
  height_cm numeric check (height_cm between 100 and 250),
  -- b01 rules 1-3: exertional chest pain, fainting, palpitations, unusual
  -- breathlessness; a known heart, metabolic or kidney disease; clearance.
  cardiac_symptoms boolean,
  known_condition boolean,
  medical_clearance boolean,
  -- p03 rules 19-21: the postpartum return.
  caesarean boolean,
  postpartum_cleared boolean,
  -- b04 rule 18: first-marathon long-run share.
  marathons_completed int check (marathons_completed between 0 and 500),
  updated_at timestamptz not null default now()
);

alter table public.health_profiles enable row level security;

drop policy if exists "own health profile" on public.health_profiles;
create policy "own health profile" on public.health_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------
-- * tests/rls-schema.test.mjs checks the new table has RLS and a policy
--   scoped to auth.uid(); tests/rls-live.test.mjs attacks it with two users
--   once this migration has run (and lists it as skipped until then).

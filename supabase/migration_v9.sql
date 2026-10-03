-- =============================================================
-- Runko — migration v9 (paid plans: entitlements, Stripe, limits)
-- Paste into the Supabase SQL Editor and run once, after migration_v8.
-- Run it BEFORE deploying the new Edge Functions: they read these tables.
--
-- NEW STATEMENTS ONLY. Idempotent.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. No more free trial without a card
-- ---------------------------------------------------------------
--
-- Every signup used to get users.trial_end = now() + 1 month from a column
-- default. New accounts now start a 14-day trial through Stripe Checkout
-- (card required), so the default goes. Rows that already have a trial_end
-- keep it: those runners keep access until that date, then see the paywall
-- (supabase/functions/_shared/entitlements.js, source 'legacy_trial').
alter table public.users alter column trial_end drop default;
alter table public.users alter column trial_end drop not null;
alter table public.users alter column subscription_status set default 'none';

-- ---------------------------------------------------------------
-- 2. subscriptions — one row per runner, written only by the server
-- ---------------------------------------------------------------
--
-- Kept apart from public.users on purpose: a users row exists only once
-- onboarding has finished, and a runner pays BEFORE onboarding. RLS lets a
-- runner read their own row (the app shows it) and nobody but the service
-- role (the Stripe webhook, the billing function) write it.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Pro access without paying (the founder and testers). Set by hand, see
  -- PROGRESS.md "Comped accounts".
  comped boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  -- Stripe's own subscription status: trialing, active, past_due, canceled...
  status text,
  tier text check (tier in ('start', 'pro')),
  billing_interval text check (billing_interval in ('month', 'year')),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  payment_failed_at timestamptz,
  -- One card trial per account: set once a Stripe trial has started.
  trial_used boolean not null default false,
  -- The trial_end a "trial ends in 2 days" email was sent for (Stage 8).
  trial_reminder_sent_for timestamptz,
  -- created time of the newest Stripe event applied, so an older event
  -- arriving late cannot overwrite a newer state.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read" on public.subscriptions
  for select using (auth.uid() = user_id);

-- No insert/update/delete grant or policy for clients: only the service role
-- writes here. Revoked explicitly in case the project's defaults grant them.
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ---------------------------------------------------------------
-- 3. plan_builds — every plan build the server allowed
-- ---------------------------------------------------------------
--
-- The plan-build limits (Start once a month, Pro 5 a day, trial one plan)
-- are counted here and nowhere else. users.last_plan_created_at is written by
-- the client and so cannot be the thing that is counted. No policies: only
-- the Edge Functions (service role) read or write it.
create table if not exists public.plan_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null,
  -- AI calls made under this build (the proxy allows a few: model fallbacks
  -- and one stricter retry).
  ai_calls int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.plan_builds enable row level security;

create index if not exists plan_builds_user_time_idx
  on public.plan_builds (user_id, created_at desc);

-- Builds made before this migration count too, so a runner on the old trial
-- who already has a plan has used the trial's one build.
insert into public.plan_builds (user_id, tier, created_at)
select u.id, 'legacy', u.last_plan_created_at
  from public.users u
 where u.last_plan_created_at is not null
   and not exists (select 1 from public.plan_builds b where b.user_id = u.id);

-- ---------------------------------------------------------------
-- 4. ai_usage — which calls count toward the daily limits
-- ---------------------------------------------------------------
--
-- Every call is still recorded before it is made (the hourly limit counts
-- failures too). A call the AI provider refused is then marked not billable,
-- so a model fallback inside one chat message does not use up two of the
-- day's messages.
alter table public.ai_usage add column if not exists billable boolean not null default true;

create index if not exists ai_usage_user_kind_time_idx
  on public.ai_usage (user_id, kind, created_at desc);

-- The daily limits look back to midnight; keep two days, not one.
-- (Replaces the 1-day housekeeping line from migration_v5.)
delete from public.ai_usage where created_at < now() - interval '2 days';

-- ---------------------------------------------------------------
-- 5. stripe_events — webhook idempotency
-- ---------------------------------------------------------------
--
-- Stripe may deliver an event more than once. The webhook inserts the event
-- id first and skips one it has seen. Service role only, no policies.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------
-- 6. training_breaks — "Poškodba / bolezen"
-- ---------------------------------------------------------------
--
-- What the runner reported, and the plan weeks as they were before the change
-- (so "Razveljavi" can put them back). The coach reads the active one. The
-- runner owns these rows like their runs: read, write and delete their own.
create table if not exists public.training_breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('injury', 'illness', 'other')),
  days int not null check (days between 1 and 60),
  strong_pain boolean not null default false,
  start_date date not null,
  rest_until date not null,
  return_until date not null,
  original_weeks jsonb not null default '[]'::jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.training_breaks enable row level security;

drop policy if exists "own training breaks" on public.training_breaks;
create policy "own training breaks" on public.training_breaks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists training_breaks_user_idx
  on public.training_breaks (user_id, created_at desc);

-- ---------------------------------------------------------------
-- 7. weekly_reviews — the weekly progress review (Pro and trial)
-- ---------------------------------------------------------------
--
-- One row per runner per reviewed week (the Monday of that week, Ljubljana).
-- The ai-proxy claims the row BEFORE the AI call and fills it after, so a
-- week is never generated twice, whatever the app does. The runner can read
-- their own; only the proxy (service role) writes.
create table if not exists public.weekly_reviews (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  content jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_reviews enable row level security;

drop policy if exists "own weekly reviews read" on public.weekly_reviews;
create policy "own weekly reviews read" on public.weekly_reviews
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.weekly_reviews from anon, authenticated;

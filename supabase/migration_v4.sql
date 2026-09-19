-- =============================================================
-- Runko — migration v4
-- Paste into the Supabase SQL Editor and run once.
--
-- NEW STATEMENTS ONLY. Existing tables, policies and indexes are not
-- re-issued (CREATE POLICY has no IF NOT EXISTS and would error).
-- Everything here is idempotent, so re-running is safe.
--
-- What changed: the training goal is now a DISTANCE IN KILOMETRES plus an
-- optional date and an optional target time, replacing the named race type.
-- Plan creation also collects the runner's experience and availability.
-- =============================================================

-- ---------------------------------------------------------------
-- users — the goal is a number now
-- ---------------------------------------------------------------

-- Target distance in km. Free-form: 5, 10, 15, 21.1, 30, 42.2 are all equally
-- valid — the UI chips are shortcuts for this number, not categories.
alter table public.users add column if not exists target_distance_km numeric;

-- Optional goal time, stored in MINUTES (e.g. 105 = 1:45:00). The plan engine
-- checks it against the runner's VDOT and, if it is out of reach, builds
-- toward the best realistic outcome instead.
alter table public.users add column if not exists target_time_min numeric;

-- ---------------------------------------------------------------
-- users — richer plan-creation input
-- ---------------------------------------------------------------

-- Roughly how long they have been running, in months.
alter table public.users add column if not exists experience_months int;

-- Their own estimate of typical weekly volume, in km. Trusted over the logs,
-- which may only cover one quiet week.
alter table public.users add column if not exists weekly_volume_km numeric;

-- Longest run in recent memory, in km.
alter table public.users add column if not exists longest_run_km numeric;

-- How many days a week they can train, and which weekdays are actually free.
-- available_days holds full English weekday names ('Monday' … 'Sunday').
alter table public.users add column if not exists days_per_week int;
alter table public.users add column if not exists available_days text[];

-- ---------------------------------------------------------------
-- Backfill: carry existing goals over to the new shape
-- ---------------------------------------------------------------

-- Best-effort read of the distance out of old free-text event names, so
-- existing users keep a sensible goal. Anything unrecognised is left NULL and
-- the runner is simply asked next time they build a plan.
update public.users
   set target_distance_km = case
     when event_name ~* 'marathon' and event_name !~* 'half|pol' then 42.2
     when event_name ~* 'half|polmaraton' then 21.1
     when event_name ~* '\m10\s*k'  then 10
     when event_name ~* '\m5\s*k'   then 5
     else null
   end
 where target_distance_km is null
   and event_name is not null;

-- ---------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------
-- * event_name is KEPT but no longer written by the app. The goal is the
--   distance; the date is optional. Nothing reads it any more, so it can be
--   dropped later once you are happy with the backfill above.
-- * goal ('event' | 'general') is still used, and now simply means "is there
--   a date on the calendar".
-- * No change to training_plans: the richer plan shape (target_distance_km,
--   goal_assessment, intro, phases, paces) lives inside plan_json.
-- * No change to coach_memory or chat_messages. The "Clear conversation"
--   action deletes chat_messages rows only, by design.
-- * last_plan_created_at is still written on every plan build even though the
--   once-a-month limit is currently switched off in code
--   (PLAN_LIMIT_ENABLED in src/core/plan.js), so the limit can be re-enabled
--   later without another migration.

-- =============================================================
-- Runko — migration v5 (security hardening)
-- Paste into the Supabase SQL Editor and run once.
--
-- NEW STATEMENTS ONLY. Existing tables, policies and indexes are not
-- re-issued. Everything here is idempotent.
-- =============================================================

-- ---------------------------------------------------------------
-- ai_usage — per-user rate limiting for the AI proxy
-- ---------------------------------------------------------------
--
-- One row per AI call. The Edge Function counts the last hour's rows before
-- forwarding anything to Groq, so a signed-in user cannot run up the bill.
--
-- NOTE the deliberate absence of policies below: RLS is ENABLED and NO
-- policy is created, which means no client — anon or authenticated — can
-- read or write this table at all. Only the Edge Function reaches it, using
-- the service-role key, which bypasses RLS. That is the whole point: a user
-- must not be able to read, delete or forge their own usage records.
create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text,                       -- 'chat' | 'plan' | 'memory' | …, for later analysis
  created_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

-- Counting "this user's calls in the last hour" is the only query it serves.
create index if not exists ai_usage_user_time_idx
  on public.ai_usage (user_id, created_at desc);

-- Housekeeping: nothing older than a day is ever needed for a 1-hour window.
-- Safe to run repeatedly; schedule it with pg_cron if you want it automatic.
delete from public.ai_usage where created_at < now() - interval '1 day';

-- ---------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------
-- * No change to any existing table.
-- * After running this, deploy the Edge Function and set the Groq secret:
--     supabase functions deploy ai-proxy
--     supabase secrets set GROQ_API_KEY=gsk_...
--   Full instructions are in supabase/functions/ai-proxy/README.md.
-- * Once the function is live, remove VITE_GROQ_API_KEY from your local .env
--   and from any hosting provider's environment. It is no longer read by the
--   client and must not be shipped in a bundle.

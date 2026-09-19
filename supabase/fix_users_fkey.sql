-- =============================================================
-- Fix: "insert or update on table users violates foreign key
--       constraint users_id_fkey"
--
-- public.users.id must reference auth.users(id). This script makes the
-- live database match schema.sql regardless of how the constraint was
-- originally created. Run it in the Supabase SQL Editor; safe to re-run.
-- =============================================================

-- 1) See what the constraint currently points at (for your own eyes):
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.users'::regclass and contype = 'f';

-- 2) Drop the old constraint, whatever it referenced.
alter table public.users drop constraint if exists users_id_fkey;

-- 3) Remove orphaned profile rows that have no matching auth user —
--    these are what make re-adding the constraint fail. (Their plans,
--    workouts and chat messages cascade-delete with them.)
delete from public.users u
where not exists (select 1 from auth.users a where a.id = u.id);

-- 4) Recreate the constraint exactly as schema.sql defines it.
alter table public.users
  add constraint users_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

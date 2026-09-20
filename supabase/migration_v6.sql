-- =============================================================
-- Runko — migration v6 (paywall enforcement)
-- Paste into the Supabase SQL Editor and run once.
--
-- NEW STATEMENTS ONLY. Existing tables and policies are not re-issued.
-- Everything here is idempotent.
-- =============================================================

-- ---------------------------------------------------------------
-- users.trial_end / users.subscription_status become read-only
-- ---------------------------------------------------------------
--
-- The "own profile" policy is `for all using (auth.uid() = id)`, which is
-- right for a runner's own name and age and wrong for the two columns that
-- decide whether they have paid. RLS scopes access to the ROW; it has no
-- opinion about columns. So with nothing but the anon key that ships in the
-- browser bundle, any signed-in user could run:
--
--   update users set subscription_status = 'active' where id = <their own id>
--   update users set trial_end = now() + interval '1 year' where id = <own id>
--
-- and both were accepted. That is the paywall, bypassed in one request — and
-- it is also the column a future Stripe webhook will write, which the
-- customer must not be able to forge.
--
-- Column-level privileges are the fix. Note the order: a REVOKE of a column
-- privilege does nothing while the role still holds the table-level one, so
-- the table-level grant is withdrawn first and then handed back column by
-- column. Anything not listed below is no longer writable by a user —
-- including trial_end, subscription_status and created_at.
--
-- service_role is untouched and keeps full access, which is how the AI proxy
-- and a future Stripe webhook will write these columns.

revoke insert, update on public.users from authenticated;

-- Every column the app legitimately writes (core/db.js saveProfile and
-- updateProfile, pages/Onboarding.jsx profileFields). Adding a profile column
-- later means adding it here too, or writes to it will fail with a 403.
grant insert (
  id, name, age, weight, goal, fitness_level, event_name, event_date,
  target_distance_km, target_time_min, experience_months, weekly_volume_km,
  longest_run_km, days_per_week, available_days, coach_notes,
  last_plan_created_at
) on public.users to authenticated;

grant update (
  id, name, age, weight, goal, fitness_level, event_name, event_date,
  target_distance_km, target_time_min, experience_months, weekly_volume_km,
  longest_run_km, days_per_week, available_days, coach_notes,
  last_plan_created_at
) on public.users to authenticated;

-- `id` is grantable above because PostgREST's upsert writes it in the
-- ON CONFLICT ... DO UPDATE SET clause. It is not a hole: the `own profile`
-- policy's WITH CHECK (auth.uid() = id) still rejects any row whose id is
-- not the caller's, so a user can only ever set their own id to itself.

-- ---------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------
-- * No change to any table, policy or row.
-- * tests/rls-live.test.mjs asserts both that the self-grant is refused and
--   that an ordinary profile update still works, so an over-broad revoke
--   here fails the test suite rather than the app.

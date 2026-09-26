-- =============================================================
-- Runko — migration v8 (three more optional health-profile answers)
-- Paste into the Supabase SQL Editor and run once, after migration_v7.
--
-- NEW STATEMENTS ONLY. Idempotent.
-- =============================================================
--
-- Same rules as the rest of health_profiles (migration_v7): optional, asked
-- only after the consent line, only what the plan engine reads, deleted with
-- one button in Settings and with the account. The table's row-level-security
-- policy already covers new columns.

-- p03 r22-23: pelvic-floor symptoms with running (leakage, heaviness,
-- dragging, pelvic pain) stop running; a grade 3-4 perineal tear needs a
-- pelvic-health physiotherapist before any running. Asked only postpartum.
alter table public.health_profiles add column if not exists pelvic_floor_symptoms boolean;
alter table public.health_profiles add column if not exists severe_tear boolean;

-- p08 r12: a teenager who grew 2 cm or more in the last three months is in a
-- growth spurt (progression capped at 5% a week). Asked only under 18.
alter table public.health_profiles add column if not exists height_gain_cm_3mo numeric
  check (height_gain_cm_3mo between 0 and 20);

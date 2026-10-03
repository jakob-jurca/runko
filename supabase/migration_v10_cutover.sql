-- =============================================================
-- Runko — migration v10 (cutover: no more free trial without a card)
-- Run in the SQL Editor RIGHT AFTER the new app (Vercel) and the new Edge
-- Functions are live. Not before: the old app gives every new signup the
-- 1-month no-card trial through these defaults, and without them a new
-- signup on the old app would get no AI coach at all.
--
-- Idempotent. Existing users are not touched: whoever has a trial_end keeps
-- it until that date (the "old trial", see _shared/entitlements.js).
-- =============================================================

-- New accounts start their 14-day trial through Stripe Checkout (card
-- required) instead of getting one from a column default.
alter table public.users alter column trial_end drop default;
alter table public.users alter column trial_end drop not null;
alter table public.users alter column subscription_status set default 'none';

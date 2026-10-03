-- Make jakob.jurca@gmail.com the creator: everything, no limits, never a paywall.
-- Run in the Supabase SQL Editor AFTER supabase/migration_v9.sql.
-- Works before or after the account has a subscription; safe to run twice.
insert into public.subscriptions (user_id, creator)
select id, true from auth.users where email = 'jakob.jurca@gmail.com'
on conflict (user_id) do update set creator = true;

-- Check: one row, creator = true.
select u.email, s.creator, s.comped, s.status
  from public.subscriptions s join auth.users u on u.id = s.user_id
 where u.email = 'jakob.jurca@gmail.com';

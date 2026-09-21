-- Hotel Operations — foundation alignment
-- Applied to the live Supabase project on 2026-09-21 so that
-- 0002_stays_payments_departures.sql passes its foundation guard.
--
-- The foundation tables (hotels, staff_profiles, room_categories, rooms) were
-- created directly in the Supabase Dashboard without `rooms.active` and
-- `room_categories.daily_rate`. This migration is idempotent and safe to
-- re-run: it only adds missing columns and backfills missing confirmed rates.

alter table public.rooms
  add column if not exists active boolean not null default true;

alter table public.room_categories
  add column if not exists daily_rate numeric(12, 0);

update public.room_categories set daily_rate = 40000 where name ilike '%standard%'  and daily_rate is null;
update public.room_categories set daily_rate = 60000 where name ilike '%deluxe%'    and daily_rate is null;
update public.room_categories set daily_rate = 80000 where name ilike '%executive%' and daily_rate is null;

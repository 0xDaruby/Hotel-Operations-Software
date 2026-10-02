-- Keep room categories readable to signed-in staff and service code while
-- removing client/service-role write privileges. Dashboard and migration
-- owners retain control.
--
-- Restrictive RLS policies provide defense in depth if a later grant is added.
-- This migration is intentionally checked in but must not be applied until the
-- operator approves the production permission change.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.room_categories') IS NULL THEN
    RAISE EXCEPTION 'public.room_categories must exist before applying this migration.';
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.room_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.room_categories TO authenticated, service_role;

DROP POLICY IF EXISTS "staff cannot insert room categories" ON public.room_categories;
CREATE POLICY "staff cannot insert room categories"
  ON public.room_categories AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "staff cannot update room categories" ON public.room_categories;
CREATE POLICY "staff cannot update room categories"
  ON public.room_categories AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "staff cannot delete room categories" ON public.room_categories;
CREATE POLICY "staff cannot delete room categories"
  ON public.room_categories AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

COMMIT;
-- Keep rooms readable to authenticated staff and service code while removing
-- anon/client/service-role write privileges. Dashboard and migration
-- owners retain control.
--
-- Restrictive RLS policies provide defense in depth if a later grant is added.
-- This migration is intentionally checked in but must not be applied until the
-- operator approves the production permission change.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'public.rooms must exist before applying this migration.';
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.rooms FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.rooms TO authenticated, service_role;

DROP POLICY IF EXISTS "clients cannot insert rooms" ON public.rooms;
CREATE POLICY "clients cannot insert rooms"
  ON public.rooms AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "clients cannot update rooms" ON public.rooms;
CREATE POLICY "clients cannot update rooms"
  ON public.rooms AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "clients cannot delete rooms" ON public.rooms;
CREATE POLICY "clients cannot delete rooms"
  ON public.rooms AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

COMMIT;
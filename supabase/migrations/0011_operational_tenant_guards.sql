-- Forward security repair: enforce tenant ownership even inside SECURITY DEFINER RPCs.
-- Transactional, no row backfill. Rollback uses a new migration restoring the prior
-- room_is_ready body and dropping these named triggers/function (weakens isolation).
BEGIN;
ALTER FUNCTION public.touch_updated_at() SET search_path = '';
CREATE OR REPLACE FUNCTION public.room_is_ready(p_room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms r
    JOIN public.staff_profiles p ON p.hotel_id = r.property_id
    WHERE r.id = p_room_id AND r.active AND p.user_id = auth.uid() AND p.active
  )
  AND NOT EXISTS (SELECT 1 FROM public.stays s WHERE s.room_id = p_room_id AND s.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM public.inspection_requirements i WHERE i.room_id = p_room_id AND i.status <> 'approved')
  AND NOT EXISTS (SELECT 1 FROM public.maintenance_issues m WHERE m.room_id = p_room_id AND m.status = 'open');
$function$;
REVOKE ALL ON FUNCTION public.room_is_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_is_ready(uuid) TO authenticated;

CREATE FUNCTION public.enforce_operational_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE facts jsonb := to_jsonb(NEW); target_hotel uuid := (facts->>'hotel_id')::uuid;
BEGIN
  IF (facts->>'room_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = (facts->>'room_id')::uuid AND property_id = target_hotel
  ) THEN RAISE EXCEPTION 'Room does not belong to this hotel.'; END IF;
  IF (facts->>'category_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories WHERE id = (facts->>'category_id')::uuid AND property_id = target_hotel
  ) THEN RAISE EXCEPTION 'Category does not belong to this hotel.'; END IF;
  IF (facts->>'stay_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stays WHERE id = (facts->>'stay_id')::uuid AND hotel_id = target_hotel
  ) THEN RAISE EXCEPTION 'Stay does not belong to this hotel.'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_operational_tenant() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stays_tenant_guard BEFORE INSERT OR UPDATE ON public.stays FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_tenant();
CREATE TRIGGER payments_tenant_guard BEFORE INSERT OR UPDATE ON public.payment_records FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_tenant();
CREATE TRIGGER inspections_tenant_guard BEFORE INSERT OR UPDATE ON public.inspection_requirements FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_tenant();
CREATE TRIGGER maintenance_tenant_guard BEFORE INSERT OR UPDATE ON public.maintenance_issues FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_tenant();
CREATE TRIGGER activity_tenant_guard BEFORE INSERT OR UPDATE ON public.activity_events FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_tenant();
COMMIT;

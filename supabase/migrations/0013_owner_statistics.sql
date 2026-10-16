-- One aggregate response avoids Data API row limits and retains caller RLS.
BEGIN;
CREATE FUNCTION public.get_owner_statistics(p_today date, p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE user_id = auth.uid() AND active AND NOT setup_pending AND role = 'owner'
  ) THEN RAISE EXCEPTION 'Active owner access is required.'; END IF;
  IF p_today IS NULL OR p_now IS NULL THEN
    RAISE EXCEPTION 'An operating date and current time are required.';
  END IF;
  WITH payments AS (
    SELECT
      COALESCE(sum(p.amount) FILTER (WHERE p.received_on = p_today), 0) AS today,
      COALESCE(sum(p.amount) FILTER (WHERE p.received_on = p_today - 1), 0) AS yesterday,
      COALESCE(sum(p.amount) FILTER (WHERE p.received_on = p_today AND p.kind = 'initial'), 0) AS initial,
      COALESCE(sum(p.amount) FILTER (WHERE p.received_on = p_today AND p.kind = 'extension'), 0) AS extension
    FROM public.payment_records p JOIN public.stays s ON s.id = p.stay_id
    WHERE p.received_on IN (p_today, p_today - 1) AND s.status <> 'void'
  ), movement AS (
    SELECT count(*) FILTER (WHERE action = 'stay.arrived') AS arrivals,
      count(*) FILTER (WHERE action = 'stay.departed') AS departures,
      count(*) FILTER (WHERE action = 'stay.extended') AS extensions
    FROM public.activity_events
    WHERE created_at >= (p_today::timestamp AT TIME ZONE 'Africa/Lagos')
      AND created_at < ((p_today + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
  )
  SELECT jsonb_build_object(
    'paymentTotals', jsonb_build_object('today', p.today, 'yesterday', p.yesterday),
    'movement', jsonb_build_object('arrivals', m.arrivals, 'departures', m.departures,
      'extensions', m.extensions, 'initialPayments', p.initial, 'extensionPayments', p.extension,
      'departuresDueSoon', (SELECT count(*) FROM public.stays
        WHERE status = 'active' AND departure_due_at >= p_now AND departure_due_at <= p_now + interval '4 hours'))
  ) INTO result FROM payments p CROSS JOIN movement m;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_owner_statistics(date, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_statistics(date, timestamptz) TO authenticated;
COMMIT;

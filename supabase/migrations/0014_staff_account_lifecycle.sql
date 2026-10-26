-- Forward-only lifecycle hardening. No data backfill. Reversal requires a reviewed
-- forward migration; removing the fence would restore access to revoked JWTs.
BEGIN;
ALTER TABLE public.staff_profiles
 ADD COLUMN revoked_before timestamptz,
 ADD COLUMN deletion_request_id uuid,
 ADD COLUMN deletion_requested_by uuid REFERENCES public.staff_profiles(user_id),
 ADD COLUMN deletion_reason text,
 ADD COLUMN account_deleted_at timestamptz;
-- Only detach the Auth identity FK. Historical operational references stay intact.
DO $body$
DECLARE fk record;
BEGIN
 FOR fk IN SELECT c.conname FROM pg_catalog.pg_constraint c
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.conrelid='public.staff_profiles'::regclass
 AND c.confrelid='auth.users'::regclass AND a.attname='user_id'
 LOOP EXECUTE format('ALTER TABLE public.staff_profiles DROP CONSTRAINT %I',fk.conname); END LOOP;
END;
$body$;
CREATE FUNCTION private.session_allowed(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE profile public.staff_profiles; claims jsonb; session_claim text;
BEGIN
 SELECT * INTO profile FROM public.staff_profiles WHERE user_id=p_user_id;
 IF NOT FOUND OR profile.account_deleted_at IS NOT NULL OR profile.deletion_request_id IS NOT NULL THEN RETURN false; END IF;
 IF profile.revoked_before IS NULL THEN RETURN true; END IF;
 BEGIN
  claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  session_claim := claims->>'session_id';
  IF session_claim IS NULL OR session_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=session_claim::uuid AND s.user_id=p_user_id AND s.created_at>profile.revoked_before);
 EXCEPTION WHEN invalid_text_representation THEN RETURN false;
 END;
END;
$body$;
REVOKE ALL ON FUNCTION private.session_allowed(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.current_hotel_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT hotel_id FROM public.staff_profiles WHERE user_id=(SELECT auth.uid()) AND active AND NOT setup_pending AND private.session_allowed(user_id)
$body$;
CREATE OR REPLACE FUNCTION private.current_staff_role() RETURNS public.staff_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT role FROM public.staff_profiles WHERE user_id=(SELECT auth.uid()) AND active AND NOT setup_pending AND private.session_allowed(user_id)
$body$;
-- Self-profile reads use a separate own-identity-only predicate so setup remains
-- discoverable while revoked/deleted identities cannot read retained history.
CREATE FUNCTION private.own_staff_profile_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT private.session_allowed(auth.uid())
$body$;
REVOKE ALL ON FUNCTION private.own_staff_profile_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.own_staff_profile_allowed() TO authenticated;
-- Restrictive guards are ANDed with existing permissive read policies. Their
-- names and definitions remain intact, and no permissive policy can bypass the
-- session/tenant boundary. These guards never grant access on their own.
CREATE POLICY staff_session_guard ON public.staff_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (
 (user_id=(SELECT auth.uid()) AND (SELECT private.own_staff_profile_allowed()))
 OR (hotel_id=(SELECT private.current_hotel_id()) AND (SELECT private.current_staff_role())='owner')
);
CREATE POLICY staff_session_guard ON public.hotels AS RESTRICTIVE FOR SELECT TO authenticated USING (id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.rooms AS RESTRICTIVE FOR SELECT TO authenticated USING (property_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.room_categories AS RESTRICTIVE FOR SELECT TO authenticated USING (property_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.stays AS RESTRICTIVE FOR SELECT TO authenticated USING (hotel_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.payment_records AS RESTRICTIVE FOR SELECT TO authenticated USING (hotel_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.activity_events AS RESTRICTIVE FOR SELECT TO authenticated USING (hotel_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.inspection_requirements AS RESTRICTIVE FOR SELECT TO authenticated USING (hotel_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.maintenance_issues AS RESTRICTIVE FOR SELECT TO authenticated USING (hotel_id=(SELECT private.current_hotel_id()));
CREATE POLICY staff_session_guard ON public.stay_room_moves AS RESTRICTIVE FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.stays s WHERE s.id=stay_id AND s.hotel_id=(SELECT private.current_hotel_id()))
);
CREATE FUNCTION private.enforce_staff_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
BEGIN
 IF (OLD.deletion_request_id IS NOT NULL OR OLD.account_deleted_at IS NOT NULL)
 AND (NEW.active OR NEW.setup_pending OR NEW.deletion_request_id IS DISTINCT FROM OLD.deletion_request_id
 OR NEW.deletion_requested_by IS DISTINCT FROM OLD.deletion_requested_by OR NEW.deletion_reason IS DISTINCT FROM OLD.deletion_reason) THEN
  RAISE EXCEPTION 'Account deletion is pending or completed.';
 END IF;
 -- The first password setup keeps its just-established setup session. Any
 -- previously fenced account, cancellation, or later activation still revokes.
 IF (NEW.active IS DISTINCT FROM OLD.active AND NOT (
   OLD.setup_pending AND NOT NEW.setup_pending AND NEW.active
   AND OLD.revoked_before IS NULL AND NOT OLD.setup_cancelled AND NOT NEW.setup_cancelled
 ))
 OR (OLD.deletion_request_id IS NULL AND NEW.deletion_request_id IS NOT NULL)
 OR (NEW.setup_cancelled AND NOT OLD.setup_cancelled) THEN
  NEW.revoked_before := clock_timestamp();
  DELETE FROM auth.refresh_tokens WHERE user_id=NEW.user_id::text;
  DELETE FROM auth.sessions WHERE user_id=NEW.user_id;
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION private.enforce_staff_lifecycle() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER staff_account_lifecycle BEFORE UPDATE ON public.staff_profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_staff_lifecycle();
CREATE FUNCTION public.get_staff_access_status() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE profile public.staff_profiles;
BEGIN
 IF auth.uid() IS NULL THEN RETURN 'signed-out'; END IF;
 SELECT * INTO profile FROM public.staff_profiles WHERE user_id=auth.uid();
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF profile.account_deleted_at IS NOT NULL OR profile.deletion_request_id IS NOT NULL THEN RETURN 'deleted'; END IF;
 IF profile.setup_pending THEN RETURN 'setup-pending'; END IF;
 IF NOT profile.active THEN RETURN 'inactive'; END IF;
 IF NOT private.session_allowed(profile.user_id) THEN RETURN 'revoked'; END IF;
 RETURN 'ready';
END;
$body$;
REVOKE ALL ON FUNCTION public.get_staff_access_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_staff_access_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_reception_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active AND NOT setup_pending AND private.session_allowed(user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role <> 'receptionist' THEN
    RAISE EXCEPTION 'Your role cannot perform reception actions.';
  END IF;

  RETURN v_staff;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_maintenance_report_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active AND NOT setup_pending AND private.session_allowed(user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'Your role cannot report maintenance issues.';
  END IF;

  RETURN v_staff;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_supervisor_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active AND NOT setup_pending AND private.session_allowed(user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role <> 'supervisor' THEN
    RAISE EXCEPTION 'Only Supervisors can record inspections or report maintenance issues.';
  END IF;

  RETURN v_staff;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_maintenance_resolution_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active AND NOT setup_pending AND private.session_allowed(user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'Your role cannot resolve maintenance issues.';
  END IF;

  RETURN v_staff;
END;
$$;

CREATE OR REPLACE FUNCTION public.room_is_ready(p_room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms r
    JOIN public.staff_profiles p ON p.hotel_id = r.property_id
    WHERE r.id = p_room_id AND r.active AND p.user_id = auth.uid() AND p.active AND NOT p.setup_pending AND private.session_allowed(p.user_id)
  )
  AND NOT EXISTS (SELECT 1 FROM public.stays s WHERE s.room_id = p_room_id AND s.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM public.inspection_requirements i WHERE i.room_id = p_room_id AND i.status <> 'approved')
  AND NOT EXISTS (SELECT 1 FROM public.maintenance_issues m WHERE m.room_id = p_room_id AND m.status = 'open');
$function$;

DROP FUNCTION public.get_managed_staff();

CREATE OR REPLACE FUNCTION public.get_managed_staff()
RETURNS TABLE(user_id uuid,hotel_id uuid,display_name text,role public.staff_role,active boolean,email text,setup_pending boolean,must_change_password boolean,setup_cancelled boolean,deletion_pending boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles p WHERE p.user_id=auth.uid() AND p.active AND p.role='owner' AND private.session_allowed(p.user_id);
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 RETURN QUERY SELECT p.user_id,p.hotel_id,p.display_name,p.role,p.active,u.email::text,p.setup_pending,p.must_change_password,p.setup_cancelled,(p.deletion_request_id IS NOT NULL) FROM public.staff_profiles p LEFT JOIN auth.users u ON u.id=p.user_id WHERE p.hotel_id=actor.hotel_id AND p.account_deleted_at IS NULL ORDER BY p.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_staff_profile(p_user_id uuid,p_display_name text,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' AND private.session_allowed(user_id) FOR UPDATE;
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 IF p_role IS NULL OR p_role NOT IN ('receptionist','supervisor') OR p_display_name IS NULL OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid staff details.';
  END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id AND raw_app_meta_data->>'provisioned_by'=actor.user_id::text AND created_at > now()-interval '10 minutes') THEN
    RAISE EXCEPTION 'Only a newly provisioned account can be assigned.';
  END IF;
 INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role,active,must_change_password,created_by,setup_pending) VALUES(p_user_id,actor.hotel_id,btrim(p_display_name),p_role::public.staff_role,false,true,actor.user_id,true);
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.created',NULL,NULL,NULL,pg_catalog.jsonb_build_object('user_id',p_user_id,'name',btrim(p_display_name),'role',p_role,'active',false),NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_active(p_user_id uuid,p_expected_active boolean,p_active boolean,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor public.staff_profiles;
  target public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' AND private.session_allowed(user_id) FOR UPDATE;
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id AND hotel_id=actor.hotel_id FOR UPDATE;
 IF NOT FOUND OR target.role='owner' OR target.user_id=actor.user_id THEN
    RAISE EXCEPTION 'This staff account cannot be changed.';
  END IF;
 IF target.deletion_request_id IS NOT NULL OR target.account_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Account deletion is pending or completed.'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_active IS NULL OR p_expected_active IS NULL THEN
    RAISE EXCEPTION 'Provide the activation state and a reason of 1–500 characters.';
  END IF;
 IF target.active IS DISTINCT FROM p_expected_active THEN
    RAISE EXCEPTION 'This account changed. Refresh and retry.';
  END IF;
 IF target.active=p_active THEN
    RAISE EXCEPTION 'The account already has that activation state.';
  END IF;
 IF p_active AND (target.setup_pending OR target.setup_cancelled) THEN
    RAISE EXCEPTION 'Staff must complete password setup before activation.';
  END IF;
 UPDATE public.staff_profiles SET active=p_active WHERE user_id=p_user_id;
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.activation_changed',NULL,NULL,pg_catalog.jsonb_build_object('user_id',p_user_id,'active',target.active),pg_catalog.jsonb_build_object('user_id',p_user_id,'active',p_active),btrim(p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_staff_email(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.staff_profiles; target_email text;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' AND private.session_allowed(user_id);
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 SELECT u.email INTO target_email FROM public.staff_profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=p_user_id AND p.hotel_id=actor.hotel_id AND p.deletion_request_id IS NULL AND p.account_deleted_at IS NULL AND p.setup_pending AND NOT p.active AND p.role IN ('receptionist','supervisor');
 IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending staff account is available.';
  END IF;
 RETURN target_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_staff_setup(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  target public.staff_profiles;
BEGIN
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR target.deletion_request_id IS NOT NULL OR target.account_deleted_at IS NOT NULL OR NOT target.setup_pending OR target.active OR target.role NOT IN ('receptionist','supervisor') THEN
    RAISE EXCEPTION 'No pending staff setup is available.';
  END IF;
 UPDATE public.staff_profiles SET setup_pending=false,must_change_password=false,active=true WHERE user_id=p_user_id;
 PERFORM public.log_activity(target.hotel_id,target,'staff.setup_completed',NULL,NULL,pg_catalog.jsonb_build_object('user_id',p_user_id,'active',false),pg_catalog.jsonb_build_object('user_id',p_user_id,'active',true),NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_staff_setup(p_user_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor public.staff_profiles;
  target public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' AND private.session_allowed(user_id) FOR UPDATE;
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id AND hotel_id=actor.hotel_id FOR UPDATE;
 IF NOT FOUND OR target.deletion_request_id IS NOT NULL OR target.account_deleted_at IS NOT NULL OR NOT target.setup_pending OR target.active OR target.role NOT IN ('receptionist','supervisor') THEN
    RAISE EXCEPTION 'This setup is no longer pending. Refresh and retry.';
  END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A reason of 1–500 characters is required.';
  END IF;
 UPDATE public.staff_profiles SET setup_pending=false,setup_cancelled=true,active=false WHERE user_id=p_user_id;
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.setup_cancelled',NULL,NULL,pg_catalog.jsonb_build_object('user_id',p_user_id,'setup_pending',true),pg_catalog.jsonb_build_object('user_id',p_user_id,'setup_pending',false,'active',false),btrim(p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.get_managed_staff() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_managed_staff() TO authenticated;
CREATE FUNCTION public.prepare_staff_deletion(p_user_id uuid,p_reason text,p_confirmation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor public.staff_profiles; target public.staff_profiles; request_id uuid;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND NOT setup_pending AND role='owner' AND private.session_allowed(user_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active owner access required.'; END IF;
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id AND hotel_id=actor.hotel_id FOR UPDATE;
 IF NOT FOUND OR target.role='owner' OR target.user_id=actor.user_id THEN RAISE EXCEPTION 'This staff account cannot be deleted.'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'A reason of 1–500 characters is required.'; END IF;
 IF p_confirmation IS DISTINCT FROM 'DELETE' THEN RAISE EXCEPTION 'Type DELETE to confirm account deletion.'; END IF;
 IF target.active OR target.setup_pending THEN RAISE EXCEPTION 'Only an inactive staff account with completed or cancelled setup can be deleted.'; END IF;
 IF target.deletion_request_id IS NOT NULL THEN RETURN target.deletion_request_id; END IF;
 request_id := gen_random_uuid();
 UPDATE public.staff_profiles SET deletion_request_id=request_id,deletion_requested_by=actor.user_id,deletion_reason=btrim(p_reason) WHERE user_id=p_user_id;
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.deletion_requested',NULL,NULL,NULL,jsonb_build_object('user_id',p_user_id,'request_id',request_id),btrim(p_reason));
 RETURN request_id;
END;
$body$;
CREATE FUNCTION public.complete_staff_deletion(p_user_id uuid,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE target public.staff_profiles; actor public.staff_profiles;
BEGIN
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR p_request_id IS NULL OR target.deletion_request_id IS DISTINCT FROM p_request_id THEN RAISE EXCEPTION 'Account deletion request does not match.'; END IF;
 IF target.account_deleted_at IS NOT NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'The Auth account must be removed before completing deletion.'; END IF;
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=target.deletion_requested_by;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deletion requester is unavailable.'; END IF;
 UPDATE public.staff_profiles SET account_deleted_at=clock_timestamp() WHERE user_id=p_user_id;
 PERFORM public.log_activity(target.hotel_id,actor,'staff.deleted',NULL,NULL,NULL,jsonb_build_object('user_id',p_user_id,'request_id',p_request_id),target.deletion_reason);
END;
$body$;
REVOKE ALL ON FUNCTION public.prepare_staff_deletion(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_staff_deletion(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_staff_deletion(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_staff_deletion(uuid,uuid) TO service_role;
COMMIT;

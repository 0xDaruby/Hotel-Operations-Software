BEGIN;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS setup_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS setup_cancelled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.get_managed_staff()
RETURNS TABLE(user_id uuid,hotel_id uuid,display_name text,role public.staff_role,active boolean,email text,setup_pending boolean,must_change_password boolean,setup_cancelled boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles p WHERE p.user_id=auth.uid() AND p.active AND p.role='owner';
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 RETURN QUERY SELECT p.user_id,p.hotel_id,p.display_name,p.role,p.active,u.email::text,p.setup_pending,p.must_change_password,p.setup_cancelled FROM public.staff_profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.hotel_id=actor.hotel_id ORDER BY p.display_name;
END;
$$;
CREATE OR REPLACE FUNCTION public.provision_staff_profile(p_user_id uuid,p_display_name text,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' FOR UPDATE;
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
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.created',NULL,NULL,NULL,jsonb_build_object('user_id',p_user_id,'name',btrim(p_display_name),'role',p_role,'active',false),NULL);
END;
$$;
CREATE OR REPLACE FUNCTION public.set_staff_active(p_user_id uuid,p_expected_active boolean,p_active boolean,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor public.staff_profiles;
  target public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id AND hotel_id=actor.hotel_id FOR UPDATE;
 IF NOT FOUND OR target.role='owner' OR target.user_id=actor.user_id THEN
    RAISE EXCEPTION 'This staff account cannot be changed.';
  END IF;
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
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.activation_changed',NULL,NULL,jsonb_build_object('user_id',p_user_id,'active',target.active),jsonb_build_object('user_id',p_user_id,'active',p_active),btrim(p_reason));
END;
$$;
CREATE OR REPLACE FUNCTION public.get_pending_staff_email(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.staff_profiles; target_email text;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner';
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 SELECT u.email INTO target_email FROM public.staff_profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=p_user_id AND p.hotel_id=actor.hotel_id AND p.setup_pending AND NOT p.active AND p.role IN ('receptionist','supervisor');
 IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending staff account is available.';
  END IF;
 RETURN target_email;
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_staff_setup(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  target public.staff_profiles;
BEGIN
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT target.setup_pending OR target.active OR target.role NOT IN ('receptionist','supervisor') THEN
    RAISE EXCEPTION 'No pending staff setup is available.';
  END IF;
 UPDATE public.staff_profiles SET setup_pending=false,must_change_password=false,active=true WHERE user_id=p_user_id;
 PERFORM public.log_activity(target.hotel_id,target,'staff.setup_completed',NULL,NULL,jsonb_build_object('user_id',p_user_id,'active',false),jsonb_build_object('user_id',p_user_id,'active',true),NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.get_managed_staff() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.provision_staff_profile(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_staff_active(uuid,boolean,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_pending_staff_email(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finish_staff_setup(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_managed_staff(),public.provision_staff_profile(uuid,text,text),public.set_staff_active(uuid,boolean,boolean,text),public.get_pending_staff_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_staff_setup(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.cancel_staff_setup(p_user_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor public.staff_profiles;
  target public.staff_profiles;
BEGIN
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() AND active AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN
    RAISE EXCEPTION 'Active owner access required.';
  END IF;
 SELECT * INTO target FROM public.staff_profiles WHERE user_id=p_user_id AND hotel_id=actor.hotel_id FOR UPDATE;
 IF NOT FOUND OR NOT target.setup_pending OR target.active OR target.role NOT IN ('receptionist','supervisor') THEN
    RAISE EXCEPTION 'This setup is no longer pending. Refresh and retry.';
  END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A reason of 1–500 characters is required.';
  END IF;
 UPDATE public.staff_profiles SET setup_pending=false,setup_cancelled=true,active=false WHERE user_id=p_user_id;
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.setup_cancelled',NULL,NULL,jsonb_build_object('user_id',p_user_id,'setup_pending',true),jsonb_build_object('user_id',p_user_id,'setup_pending',false,'active',false),btrim(p_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_staff_setup(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_staff_setup(uuid,text) TO authenticated;
COMMIT;



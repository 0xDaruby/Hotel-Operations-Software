-- Forward-only recovery hardening; no existing account rows are backfilled.
-- Reversal requires a reviewed forward migration, not removal of session fences.
BEGIN;

CREATE TABLE private.password_recovery_uses (
 session_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.staff_profiles(user_id),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 password_saved boolean,
 CONSTRAINT password_recovery_completion CHECK (
   (completed_at IS NULL AND password_saved IS NULL)
   OR (completed_at IS NOT NULL AND password_saved IS NOT NULL)
 )
);
CREATE INDEX password_recovery_uses_user_id_idx ON private.password_recovery_uses(user_id);
ALTER TABLE private.password_recovery_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.password_recovery_uses FROM PUBLIC,anon,authenticated,service_role;

-- Supabase issues OTP sessions for email verification. A URL's type parameter,
-- client metadata, or an ordinary password session is never recovery proof.
CREATE FUNCTION private.password_recovery_session() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE session_claim text; current_session_id uuid; subject uuid; checked_at timestamptz := clock_timestamp();
BEGIN
 subject := auth.uid();
 IF subject IS NULL THEN RETURN NULL; END IF;
 BEGIN
   session_claim := nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
   IF session_claim IS NULL OR session_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
   current_session_id := session_claim::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
 END;
 IF NOT EXISTS (
   SELECT 1 FROM public.staff_profiles p
   JOIN auth.users u ON u.id=p.user_id
   JOIN auth.sessions s ON s.user_id=p.user_id AND s.id=current_session_id
   WHERE p.user_id=subject AND p.active AND NOT p.setup_pending AND NOT p.setup_cancelled
     AND p.role IN ('owner','receptionist','supervisor')
     AND p.deletion_request_id IS NULL AND p.account_deleted_at IS NULL
     AND (p.revoked_before IS NULL OR s.created_at>p.revoked_before)
     AND s.created_at>checked_at-interval '15 minutes' AND s.created_at<=checked_at
     AND u.recovery_sent_at IS NOT NULL AND u.recovery_sent_at<=s.created_at
     AND u.recovery_sent_at>s.created_at-interval '1 hour'
     AND EXISTS (
       SELECT 1 FROM auth.mfa_amr_claims a WHERE a.session_id=s.id
       AND a.authentication_method IN ('otp','recovery')
       AND a.created_at>checked_at-interval '15 minutes'
       AND a.created_at>=s.created_at-interval '5 seconds' AND a.created_at<=checked_at
     )
     AND NOT EXISTS (SELECT 1 FROM private.password_recovery_uses r WHERE r.session_id=s.id)
     AND NOT EXISTS (
       SELECT 1 FROM private.password_recovery_uses r WHERE r.user_id=subject
       AND r.completed_at IS NULL AND r.claimed_at>checked_at-interval '15 minutes'
     )
 ) THEN RETURN NULL; END IF;
 RETURN current_session_id;
END;
$body$;
REVOKE ALL ON FUNCTION private.password_recovery_session() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_password_recovery_status() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $body$
 SELECT private.password_recovery_session() IS NOT NULL
$body$;
REVOKE ALL ON FUNCTION public.get_password_recovery_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_password_recovery_status() TO authenticated;

CREATE FUNCTION public.claim_password_recovery() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor public.staff_profiles; current_session uuid;
BEGIN
 -- Match the existing lifecycle lock order: profile, then Auth session rows.
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This password reset is unavailable or expired.'; END IF;
 current_session := private.password_recovery_session();
 IF current_session IS NULL THEN RAISE EXCEPTION 'This password reset is unavailable or expired.'; END IF;
 INSERT INTO private.password_recovery_uses(session_id,user_id) VALUES(current_session,actor.user_id)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'This password reset is unavailable or expired.'; END IF;
 UPDATE public.staff_profiles SET revoked_before=clock_timestamp() WHERE user_id=actor.user_id;
 -- Retain only the verified recovery session for the real-user Auth password
 -- update. Its operational JWT is already denied by the new profile fence.
 DELETE FROM auth.refresh_tokens WHERE user_id=actor.user_id::text AND session_id IS DISTINCT FROM current_session;
 DELETE FROM auth.sessions WHERE user_id=actor.user_id AND id<>current_session;
 PERFORM public.log_activity(actor.hotel_id,actor,'staff.password_reset_started',NULL,NULL,NULL,
   pg_catalog.jsonb_build_object('user_id',actor.user_id),NULL);
 RETURN current_session;
END;
$body$;
REVOKE ALL ON FUNCTION public.claim_password_recovery() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_password_recovery() TO authenticated;

CREATE FUNCTION public.finish_password_recovery(p_user_id uuid,p_session_id uuid,p_password_saved boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor public.staff_profiles; recovery_use private.password_recovery_uses;
BEGIN
 IF p_password_saved IS NULL THEN RAISE EXCEPTION 'A password reset outcome is required.'; END IF;
 SELECT * INTO actor FROM public.staff_profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No password reset is available.'; END IF;
 SELECT * INTO recovery_use FROM private.password_recovery_uses
 WHERE session_id=p_session_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No password reset is available.'; END IF;
 IF recovery_use.completed_at IS NOT NULL THEN
   IF recovery_use.password_saved IS DISTINCT FROM p_password_saved THEN RAISE EXCEPTION 'The password reset outcome is already recorded.'; END IF;
   RETURN;
 END IF;
 -- Also catch sessions created between claim and the Auth response. Account
 -- eligibility flags, role, hotel membership and operational history stay intact.
 UPDATE public.staff_profiles SET revoked_before=clock_timestamp() WHERE user_id=p_user_id;
 DELETE FROM auth.refresh_tokens WHERE user_id=p_user_id::text;
 DELETE FROM auth.sessions WHERE user_id=p_user_id;
 UPDATE private.password_recovery_uses SET completed_at=clock_timestamp(),password_saved=p_password_saved
 WHERE session_id=p_session_id;
 PERFORM public.log_activity(actor.hotel_id,actor,
   CASE WHEN p_password_saved THEN 'staff.password_reset_completed' ELSE 'staff.password_reset_failed' END,
   NULL,NULL,NULL,pg_catalog.jsonb_build_object('user_id',p_user_id),NULL);
END;
$body$;
REVOKE ALL ON FUNCTION public.finish_password_recovery(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_password_recovery(uuid,uuid,boolean) TO service_role;

COMMIT;

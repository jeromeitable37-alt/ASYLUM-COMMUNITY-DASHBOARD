-- ASYLUM Official Dashboard: fix Owner Change Role (PostgreSQL 42702).
-- ON CONFLICT(user_id) conflicted with RETURNS TABLE(user_id,...)
-- PL/pgSQL output variable. Use named primary-key constraint instead.
-- Safe to reapply; preserves Owner protection and role audit history.

CREATE OR REPLACE FUNCTION public.portal_change_role(p_actor uuid, p_target uuid, p_new_role text)
 RETURNS TABLE(user_id uuid, role text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE previous_role text;
DECLARE target_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_admins ca JOIN public.identities i ON i.user_id=ca.user_id
    WHERE ca.user_id=p_actor AND ca.role='owner' AND i.portal_status='active'
  ) THEN RAISE EXCEPTION 'Only the active Owner can change roles.' USING ERRCODE='P0001'; END IF;
  IF p_target=p_actor THEN RAISE EXCEPTION 'The Owner account is protected.' USING ERRCODE='P0001'; END IF;
  IF p_new_role NOT IN ('member','management','admin','moderator') THEN
    RAISE EXCEPTION 'Invalid dashboard role.' USING ERRCODE='P0001';
  END IF;
  SELECT i.portal_status,ca.role INTO target_status,previous_role
    FROM public.identities i LEFT JOIN public.community_admins ca ON ca.user_id=i.user_id
    WHERE i.user_id=p_target
    FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registered dashboard account not found.' USING ERRCODE='P0001'; END IF;
  IF previous_role='owner' THEN RAISE EXCEPTION 'Owner role is protected.' USING ERRCODE='P0001'; END IF;
  IF target_status<>'active' THEN RAISE EXCEPTION 'Restore the inactive account before changing roles.' USING ERRCODE='P0001'; END IF;
  previous_role:=COALESCE(previous_role,'member');
  IF previous_role=p_new_role THEN
    RETURN QUERY SELECT p_target,p_new_role;
    RETURN;
  END IF;
  IF p_new_role='member' THEN
    DELETE FROM public.community_admins ca WHERE ca.user_id=p_target AND ca.role<>'owner';
  ELSE
    INSERT INTO public.community_admins(user_id,role)
      VALUES(p_target,p_new_role)
      ON CONFLICT ON CONSTRAINT community_admins_pkey DO UPDATE SET role=EXCLUDED.role
      WHERE public.community_admins.role<>'owner';
  END IF;
  INSERT INTO public.portal_account_audit(actor_user_id,target_user_id,action,details)
    VALUES(p_actor,p_target,'role_change',jsonb_build_object('from',previous_role,'to',p_new_role,'source','dashboard_owner_control'));
  RETURN QUERY SELECT p_target,p_new_role;
END;
$function$


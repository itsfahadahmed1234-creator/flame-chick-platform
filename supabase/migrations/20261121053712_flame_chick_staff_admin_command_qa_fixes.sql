-- Flame Chick Batch 4 QA fix: role deactivation row type and invitation acceptance query.
DO $patch$
DECLARE v_def text; v_old text; v_new text;
BEGIN
 v_def:=pg_catalog.pg_get_functiondef('public.flame_chick_staff_admin_command(text,jsonb)'::regprocedure);
 v_old:='  v_invite app_private.staff_invitation_requests%ROWTYPE;'||E'\n';
 v_new:=v_old||'  v_role_row public.user_roles%ROWTYPE;'||E'\n';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_DECLARATION_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 v_old:='    SELECT * INTO STRICT v_invite FROM app_private.staff_invitation_requests WHERE false;';
 v_new:=E'    SELECT * INTO v_role_row FROM public.user_roles\n    WHERE id=v_role_id AND restaurant_id=v_restaurant_id FOR UPDATE;\n    IF NOT FOUND THEN RAISE EXCEPTION ''STAFF_ROLE_NOT_FOUND'' USING ERRCODE=''P0001''; END IF;\n    IF v_role_row.user_id=v_actor THEN RAISE EXCEPTION ''STAFF_ROLE_SELF_DEACTIVATION_DENIED'' USING ERRCODE=''42501''; END IF;\n    IF NOT v_role_row.is_active THEN\n      IF v_role_row.disabled_request_id=v_request_id THEN RETURN pg_catalog.jsonb_build_object(''ok'',true,''idempotent'',true,''role_id'',v_role_row.id,''is_active'',false); END IF;\n      RAISE EXCEPTION ''STAFF_ROLE_ALREADY_INACTIVE'' USING ERRCODE=''23514'';\n    END IF;\n    UPDATE public.user_roles SET is_active=false,disabled_by=v_actor,disabled_reason=v_reason,disabled_request_id=v_request_id WHERE id=v_role_row.id;\n    RETURN pg_catalog.jsonb_build_object(''ok'',true,''idempotent'',false,''role_id'',v_role_row.id,''is_active'',false);';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_DEACTIVATE_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 v_old:=E'    SELECT * INTO v_invite\n    FROM app_private.staff_invitation_requests i\n    JOIN public.restaurants r ON r.id=i.restaurant_id\n    WHERE r.slug=''flame-chick'' AND r.is_active\n      AND i.normalized_email=v_auth_email AND i.status=''accepted''\n      AND i.auth_user_id=v_actor\n    ORDER BY i.created_at DESC LIMIT 1;';
 v_new:=E'    SELECT i.* INTO v_invite\n    FROM app_private.staff_invitation_requests i JOIN public.restaurants r ON r.id=i.restaurant_id\n    WHERE r.slug=''flame-chick'' AND r.is_active AND i.restaurant_id=v_restaurant_id\n      AND i.normalized_email=v_auth_email AND i.status=''accepted'' AND i.auth_user_id=v_actor\n    ORDER BY i.created_at DESC LIMIT 1;';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_ACCEPT_IDEMPOTENCY_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 v_old:=E'    SELECT i.* INTO v_invite\n    FROM app_private.staff_invitation_requests i\n    JOIN public.restaurants r ON r.id=i.restaurant_id\n    WHERE r.id=v_restaurant_id AND i.normalized_email=v_auth_email\n      AND i.auth_user_id IS NOT DISTINCT FROM NULL OR false;';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_ACCEPT_DEAD_QUERY_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,'');
 EXECUTE v_def;
END
$patch$;
DO $verify$
DECLARE v_def text;
BEGIN
 v_def:=pg_catalog.pg_get_functiondef('public.flame_chick_staff_admin_command(text,jsonb)'::regprocedure);
 IF pg_catalog.strpos(v_def,'WHERE false')>0 OR pg_catalog.strpos(v_def,'IS NOT DISTINCT FROM NULL OR false')>0 OR pg_catalog.strpos(v_def,'STAFF_ROLE_SELF_DEACTIVATION_DENIED')=0 THEN
  RAISE EXCEPTION 'BATCH4_PATCH_VERIFICATION_FAILED';
 END IF;
END
$verify$;

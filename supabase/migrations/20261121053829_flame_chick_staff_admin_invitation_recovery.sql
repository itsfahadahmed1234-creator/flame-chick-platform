-- Flame Chick Batch 4 invitation recovery and active-branch acceptance hardening.
DO $patch$
DECLARE v_def text; v_old text; v_new text;
BEGIN
 v_def:=pg_catalog.pg_get_functiondef('public.flame_chick_staff_admin_command(text,jsonb)'::regprocedure);
 v_old:=E'    IF v_invite.status<>''failed'' OR v_invite.auth_user_id IS NULL THEN\n      RAISE EXCEPTION ''STAFF_INVITATION_FINALIZE_NOT_AVAILABLE'' USING ERRCODE=''23514'';\n    END IF;';
 v_new:=E'    IF v_invite.status NOT IN (''pending'',''failed'') OR v_invite.auth_user_id IS NULL THEN\n      RAISE EXCEPTION ''STAFF_INVITATION_FINALIZE_NOT_AVAILABLE'' USING ERRCODE=''23514'';\n    END IF;';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_RETRY_FINALIZE_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 v_old:=E'      RETURN pg_catalog.jsonb_build_object(''ok'',true,''idempotent'',true,''invitation_id'',v_invite.id,''email'',v_email,''role_key'',v_role);';
 v_new:=E'      RETURN pg_catalog.jsonb_build_object(''ok'',true,''idempotent'',true,''invitation_id'',v_invite.id,''email'',v_email,''role_key'',v_role,''status'',v_invite.status,''auth_user_id'',v_invite.auth_user_id);';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_INVITE_IDEMPOTENCY_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 v_old:=E'      ''branch_ids'',to_jsonb(v_branch_ids),''expires_at'',v_invite.expires_at';
 v_new:=E'      ''branch_ids'',to_jsonb(v_branch_ids),''expires_at'',v_invite.expires_at,''status'',v_invite.status,''auth_user_id'',v_invite.auth_user_id';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_INVITE_CREATE_RESPONSE_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 v_old:=E'    INSERT INTO public.user_profiles(user_id,display_name,phone,is_active)\n    VALUES(v_actor,v_invite.display_name,v_invite.phone,true)';
 v_new:=E'    IF v_invite.role_key IN (''manager'',''cashier'',''rider'') THEN\n      SELECT count(*) INTO v_branch_count FROM app_private.staff_invitation_branch_targets t\n      JOIN public.branches b ON b.id=t.branch_id AND b.restaurant_id=t.restaurant_id AND b.is_active\n      WHERE t.invitation_id=v_invite.id AND t.restaurant_id=v_restaurant_id;\n      IF v_branch_count=0 OR v_branch_count<>(SELECT count(*) FROM app_private.staff_invitation_branch_targets t WHERE t.invitation_id=v_invite.id AND t.restaurant_id=v_restaurant_id) THEN\n        RAISE EXCEPTION ''STAFF_INVITATION_BRANCH_UNAVAILABLE'' USING ERRCODE=''23514'';\n      END IF;\n    END IF;\n    INSERT INTO public.user_profiles(user_id,display_name,phone,is_active)\n    VALUES(v_actor,v_invite.display_name,v_invite.phone,true)';
 IF pg_catalog.strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'BATCH4_PATCH_BRANCH_ACCEPTANCE_NOT_FOUND'; END IF;
 v_def:=pg_catalog.replace(v_def,v_old,v_new);
 EXECUTE v_def;
END
$patch$;
DO $verify$
DECLARE v_def text;
BEGIN
 v_def:=pg_catalog.pg_get_functiondef('public.flame_chick_staff_admin_command(text,jsonb)'::regprocedure);
 IF pg_catalog.strpos(v_def,'STAFF_INVITATION_BRANCH_UNAVAILABLE')=0 OR pg_catalog.strpos(v_def,'v_invite.status NOT IN (''pending'',''failed'')')=0 THEN
  RAISE EXCEPTION 'BATCH4_RECOVERY_PATCH_VERIFICATION_FAILED';
 END IF;
END
$verify$;

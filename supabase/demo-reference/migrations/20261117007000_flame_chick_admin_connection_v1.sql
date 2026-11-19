-- Flame Chick Admin connection: expose only the branch-validated dashboard RPC to signed-in users,
-- and create the settings records required by Admin's website image and footer editors.

REVOKE ALL PRIVILEGES ON FUNCTION public.hfp_admin_dashboard(
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hfp_admin_dashboard(
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) TO authenticated, service_role;

-- The Admin UI PATCHes these rows; it intentionally does not create settings on demand.
-- Empty defaults preserve the current Flame Chick website content until the owner uploads images or edits the footer.
INSERT INTO public.restaurant_settings (
  restaurant_id, branch_id, setting_key, value_json, is_public, description
)
SELECT
  r.id,
  b.id,
  defaults.setting_key,
  defaults.value_json,
  true,
  defaults.description
FROM public.restaurants r
JOIN public.branches b
  ON b.restaurant_id = r.id
 AND b.branch_code = 'MAIN'
CROSS JOIN (
  VALUES
    ('site_images'::text, '{}'::jsonb, 'Website image slots and one previous-image backup per slot'::text),
    ('menu_hero_banners'::text, '{"slides":[]}'::jsonb, 'Website menu hero slider configuration'::text),
    ('footer_text_en'::text, '""'::jsonb, 'Public website footer text'::text)
) AS defaults(setting_key, value_json, description)
WHERE r.slug = 'flame-chick'
  AND NOT EXISTS (
    SELECT 1
    FROM public.restaurant_settings s
    WHERE s.restaurant_id = r.id
      AND s.branch_id = b.id
      AND s.setting_key = defaults.setting_key
  );

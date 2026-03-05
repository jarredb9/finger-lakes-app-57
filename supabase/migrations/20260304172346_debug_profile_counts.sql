-- Robust refactor of get_friend_profile_with_visits to ensure correct visibility checks
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(friend_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_profile jsonb;
BEGIN
    -- 1. Check if the viewer is allowed to see the profile at all
    IF NOT public.is_visible_to_viewer(friend_id_param, false) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- 2. Build the profile object with stats using explicit column references
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'visits', (
            SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    v.id,
                    v.visit_date,
                    v.user_review,
                    v.rating,
                    COALESCE(v.photos, ARRAY[]::text[]) as photos,
                    jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address,
                        'latitude', w.latitude,
                        'longitude', w.longitude
                    ) as wineries
                FROM public.visits v
                JOIN public.wineries w ON v.winery_id = w.id
                WHERE v.user_id = friend_id_param
                  -- Explicitly pass the column value
                  AND public.is_visible_to_viewer(v.user_id, v.is_private)
                ORDER BY v.visit_date DESC
            ) v_data
        ),
        'stats', jsonb_build_object(
            'visit_count', (
                SELECT count(*) 
                FROM public.visits v 
                WHERE v.user_id = friend_id_param 
                  AND public.is_visible_to_viewer(v.user_id, v.is_private)
            ),
            'wishlist_count', (
                SELECT count(*) 
                FROM public.wishlist wl 
                WHERE wl.user_id = friend_id_param 
                  AND public.is_visible_to_viewer(wl.user_id, wl.is_private)
            ),
            'favorite_count', (
                SELECT count(*) 
                FROM public.favorites f 
                WHERE f.user_id = friend_id_param 
                  AND public.is_visible_to_viewer(f.user_id, f.is_private)
            )
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = friend_id_param;

    RETURN v_profile;
END;
$$;

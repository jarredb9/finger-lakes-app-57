-- Robust refactor of get_friend_profile_with_visits with debug info
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(friend_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER;
SET search_path = public, auth
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_profile jsonb;
BEGIN
    -- Build the profile object
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'viewer_id', v_viewer_id, -- DEBUG
        'visits', (
            SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    v.id,
                    v.visit_date,
                    v.is_private, -- DEBUG
                    public.is_visible_to_viewer(v.user_id, v.is_private) as visible_to_me -- DEBUG
                FROM public.visits v
                WHERE v.user_id = friend_id_param
                  AND public.is_visible_to_viewer(v.user_id, v.is_private)
                ORDER BY v.visit_date DESC
            ) v_data
        ),
        'stats', jsonb_build_object(
            'visit_count', (SELECT count(*) FROM public.visits WHERE user_id = friend_id_param AND public.is_visible_to_viewer(user_id, is_private)),
            'wishlist_count', (SELECT count(*) FROM public.wishlist WHERE user_id = friend_id_param AND public.is_visible_to_viewer(user_id, is_private)),
            'favorite_count', (SELECT count(*) FROM public.favorites WHERE user_id = friend_id_param AND public.is_visible_to_viewer(user_id, is_private))
        ),
        'debug_favorites', ( -- DEBUG
            SELECT jsonb_agg(row_to_json(f_debug))
            FROM (
                SELECT user_id, winery_id, is_private, public.is_visible_to_viewer(user_id, is_private) as visible
                FROM public.favorites 
                WHERE user_id = friend_id_param
            ) f_debug
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = friend_id_param;

    RETURN v_profile;
END;
$$;

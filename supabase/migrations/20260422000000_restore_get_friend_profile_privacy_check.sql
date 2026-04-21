-- Restore privacy check to get_friend_profile_with_visits
-- This ensures that users cannot see private profiles of others, 
-- while still allowing owners to see their own data (including private items in counts).

CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(friend_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_profile jsonb;
    v_viewer_id uuid := auth.uid();
BEGIN
    -- 1. Check if the viewer is allowed to see the profile at all
    IF NOT public.is_visible_to_viewer(friend_id_param, false) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- 2. Build the profile object
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'visits', (
            -- Only return visits visible to the current viewer
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'winery', jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address
                    )
                ) ORDER BY v.visit_date DESC
            ), '[]'::jsonb)
            FROM public.visits v
            JOIN public.wineries w ON v.winery_id = w.id
            WHERE v.user_id = friend_id_param 
              AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
        ),
        'stats', (
            SELECT jsonb_build_object(
                'visit_count', (
                    SELECT count(*)::int 
                    FROM public.visits v 
                    WHERE v.user_id = friend_id_param 
                      AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
                ),
                'wishlist_count', (
                    SELECT count(*)::int 
                    FROM public.wishlist wl 
                    WHERE wl.user_id = friend_id_param 
                      AND (wl.user_id = v_viewer_id OR public.is_visible_to_viewer(wl.user_id, wl.is_private))
                ),
                'favorite_count', (
                    SELECT count(*)::int 
                    FROM public.favorites f 
                    WHERE f.user_id = friend_id_param 
                      AND (f.user_id = v_viewer_id OR public.is_visible_to_viewer(f.user_id, f.is_private))
                )
            )
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = friend_id_param;

    RETURN v_profile;
END;
$$;

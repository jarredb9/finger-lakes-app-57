-- Fix get_friend_activity_feed RPC to correctly check for friendship with the activity user
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);

CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(limit_val integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_feed jsonb;
BEGIN
    -- 1. Aggregate activity from friends, respecting privacy settings
    SELECT jsonb_agg(row_to_json(t))
    INTO v_feed
    FROM (
        SELECT
          'visit'::text as activity_type,
          v.created_at,
          v.user_id as activity_user_id,
          COALESCE(p.name, 'Someone')::text as user_name,
          COALESCE(p.email, 'unknown')::text as user_email,
          w.id as winery_id,
          w.name::text as winery_name,
          v.rating as visit_rating,
          v.user_review as visit_review,
          COALESCE(v.photos, ARRAY[]::text[]) as visit_photos
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        LEFT JOIN public.profiles p ON v.user_id = p.id
        WHERE 
          -- Only show visits from users who are friends with the caller (v_viewer_id)
          EXISTS (
            SELECT 1 FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user1_id = v_viewer_id AND f.user2_id = v.user_id)
                OR
                (f.user2_id = v_viewer_id AND f.user1_id = v.user_id)
              )
          )
          -- Respect visit-level privacy
          AND NOT v.is_private
          -- Respect profile-level privacy
          AND p.privacy_level != 'private'
        ORDER BY v.created_at DESC
        LIMIT limit_val
    ) t;

    -- 2. Return the flat array (or empty array if null)
    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

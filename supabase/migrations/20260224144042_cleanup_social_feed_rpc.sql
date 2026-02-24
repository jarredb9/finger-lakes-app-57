-- Cleanup get_friend_activity_feed by removing debug wrapper and returning a flat JSON array.
-- This aligns the database with the frontend expectation and removes temporary debug info.

CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_friend_ids uuid[];
    v_feed jsonb;
BEGIN
    -- 1. Get accepted friend IDs
    SELECT ARRAY(
        SELECT CASE WHEN f.user1_id = v_user_id THEN f.user2_id ELSE f.user1_id END
        FROM public.friends f
        WHERE (f.user1_id = v_user_id OR f.user2_id = v_user_id)
          AND f.status = 'accepted'
    ) INTO v_friend_ids;

    -- 2. Aggregate activity from friends
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
        WHERE v.user_id = ANY(COALESCE(v_friend_ids, ARRAY[]::uuid[]))
        ORDER BY v.created_at DESC
        LIMIT limit_val
    ) t;

    -- 3. Return the flat array (or empty array if null)
    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated;

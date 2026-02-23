-- Update social RPCs to return deep JSON debug info
-- This allows E2E tests to see why data might be missing.

CREATE OR REPLACE FUNCTION public.get_friends_and_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'debug_auth_uid', v_user_id,
        'friends', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', COALESCE(p.id, f.other_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM (
                SELECT CASE WHEN user1_id = v_user_id THEN user2_id ELSE user1_id END as other_id
                FROM friends 
                WHERE (user1_id = v_user_id OR user2_id = v_user_id) AND status = 'accepted'
            ) f
            LEFT JOIN profiles p ON f.other_id = p.id
        ),
        'requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', COALESCE(p.id, f.user1_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM friends f
            LEFT JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = v_user_id AND f.status = 'pending'
        ),
        'sent_requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', COALESCE(p.id, f.user2_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM friends f
            LEFT JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- Refactor get_friend_activity_feed to return a single JSON object for easier debugging
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);

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
    -- Get accepted friend IDs
    SELECT ARRAY(
        SELECT CASE WHEN f.user1_id = v_user_id THEN f.user2_id ELSE f.user1_id END
        FROM public.friends f
        WHERE (f.user1_id = v_user_id OR f.user2_id = v_user_id)
          AND f.status = 'accepted'
    ) INTO v_friend_ids;

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

    RETURN jsonb_build_object(
        'debug_auth_uid', v_user_id,
        'debug_friend_ids', v_friend_ids,
        'feed', COALESCE(v_feed, '[]'::jsonb)
    );
END;
$$;

-- Final cleanup: Remove debug noise and restore intended behavior
-- 1. get_friend_activity_feed (Only friends, no personal visits unless friend)
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS TABLE (
  activity_type text,
  created_at timestamptz,
  activity_user_id uuid,
  user_name text,
  user_email text,
  winery_id int,
  winery_name text,
  visit_rating int,
  visit_review text,
  visit_photos text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_friend_ids UUID[];
BEGIN
    v_caller_id := auth.uid();
    
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    -- Get accepted friend IDs
    SELECT ARRAY(
        SELECT CASE WHEN f.user1_id = v_caller_id THEN f.user2_id ELSE f.user1_id END
        FROM public.friends f
        WHERE (f.user1_id = v_caller_id OR f.user2_id = v_caller_id)
          AND f.status = 'accepted'
    ) INTO v_friend_ids;

    RETURN QUERY
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
    LIMIT limit_val;
END;
$$;

-- 2. get_friends_and_requests (No debug fields)
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

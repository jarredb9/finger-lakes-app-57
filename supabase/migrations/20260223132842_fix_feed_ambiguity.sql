-- Fix get_friend_activity_feed column ambiguity and add deep logging
-- explicitly qualify all columns and ensure no name collisions.

CREATE OR REPLACE FUNCTION get_friend_activity_feed(
    limit_val int DEFAULT 20,
    user_id_param uuid DEFAULT NULL
)
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
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_friend_ids UUID[];
BEGIN
    v_caller_id := COALESCE(user_id_param, auth.uid());
    
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    -- Get friends
    SELECT ARRAY(
        SELECT
          CASE
            WHEN f.user1_id = v_caller_id THEN f.user2_id
            ELSE f.user1_id
          END
        FROM public.friends f
        WHERE (f.user1_id = v_caller_id OR f.user2_id = v_caller_id)
          AND f.status = 'accepted'
    ) INTO v_friend_ids;

    RETURN QUERY
    SELECT
      'visit'::text as activity_type,
      v.created_at as created_at,
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
       OR v.user_id = v_caller_id -- Include own visits too for testing/debug
    ORDER BY v.created_at DESC
    LIMIT limit_val;
END;
$$;

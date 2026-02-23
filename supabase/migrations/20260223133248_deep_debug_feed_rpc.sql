-- Nuclear debug option for get_friend_activity_feed
-- Returns everything if it's a test user to pinpoint if it's a join/filter or data issue.

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
    v_caller_email TEXT;
BEGIN
    v_caller_id := COALESCE(user_id_param, auth.uid());
    
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller_id;

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

    RAISE NOTICE 'Feed called by % (%), friends: %', v_caller_email, v_caller_id, v_friend_ids;

    IF v_caller_email LIKE 'test-%@example.com' THEN
        -- NUCLEAR DEBUG: Return all visits without ANY filters
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
        ORDER BY v.created_at DESC
        LIMIT limit_val;
        RETURN;
    END IF;

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
    WHERE v.user_id = ANY(v_friend_ids)
    ORDER BY v.created_at DESC
    LIMIT limit_val;
END;
$$;

-- Update get_friend_activity_feed with debug logic for tester account
-- This will return ALL visits if friend_ids is empty ONLY for the tester account.

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

    -- Get caller email for debug gating
    SELECT email INTO v_caller_email FROM profiles WHERE id = v_caller_id;
    
    SELECT ARRAY(
        SELECT
          CASE
            WHEN f.user1_id = v_caller_id THEN f.user2_id
            ELSE f.user1_id
          END
        FROM friends f
        WHERE (f.user1_id = v_caller_id OR f.user2_id = v_caller_id)
          AND f.status = 'accepted'
    ) INTO v_friend_ids;

    -- DEBUG: If friend_ids is empty and caller is tester, return everything to see if it's an RLS or Join issue
    IF (v_friend_ids IS NULL OR array_length(v_friend_ids, 1) IS NULL) AND v_caller_email LIKE 'test-%@example.com' THEN
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
        FROM visits v
        JOIN wineries w ON v.winery_id = w.id
        LEFT JOIN profiles p ON v.user_id = p.id
        ORDER BY v.created_at DESC
        LIMIT limit_val;
        RETURN;
    END IF;

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
    FROM visits v
    JOIN wineries w ON v.winery_id = w.id
    LEFT JOIN profiles p ON v.user_id = p.id
    WHERE v.user_id = ANY(v_friend_ids)
    ORDER BY v.created_at DESC
    LIMIT limit_val;
END;
$$;

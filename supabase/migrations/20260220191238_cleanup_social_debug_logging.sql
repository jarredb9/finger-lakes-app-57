-- 1. Remove debug table
DROP TABLE IF EXISTS public.feed_debug_logs;

-- 2. Clean up send_friend_request (Keep hardening, remove logging)
CREATE OR REPLACE FUNCTION send_friend_request(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  target_user_id uuid;
  existing_request record;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO target_user_id
  FROM profiles
  WHERE email ILIKE TRIM(target_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF target_user_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a friend.';
  END IF;

  SELECT * INTO existing_request
  FROM friends
  WHERE (user1_id = current_user_id AND user2_id = target_user_id)
     OR (user1_id = target_user_id AND user2_id = current_user_id)
  LIMIT 1;

  IF existing_request.id IS NOT NULL THEN
    IF existing_request.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends.';
    ELSIF existing_request.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already sent or pending.';
    ELSE
      UPDATE friends
      SET status = 'pending',
          user1_id = current_user_id,
          user2_id = target_user_id,
          updated_at = NOW()
      WHERE id = existing_request.id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO friends (user1_id, user2_id, status)
  VALUES (current_user_id, target_user_id, 'pending');
END;
$$;

-- 3. Clean up get_friend_activity_feed (Keep hardening, remove logging)
CREATE OR REPLACE FUNCTION get_friend_activity_feed(limit_val int DEFAULT 20)
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
    v_caller_id := auth.uid();
    
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

CREATE OR REPLACE FUNCTION get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS TABLE (
  activity_type text,
  created_at timestamptz,
  user_id uuid,
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
BEGIN
  RETURN QUERY
  WITH user_friends AS (
    SELECT
      CASE
        WHEN f.user1_id = auth.uid() THEN f.user2_id
        ELSE f.user1_id
      END as friend_id
    FROM friends f
    WHERE (f.user1_id = auth.uid() OR f.user2_id = auth.uid())
      AND f.status = 'accepted'
  )
  SELECT
    'visit'::text as activity_type,
    v.created_at,
    p.id as user_id,
    p.name as user_name,
    p.email as user_email,
    w.id as winery_id,
    w.name as winery_name,
    v.rating as visit_rating,
    v.user_review as visit_review,
    v.photos as visit_photos
  FROM visits v
  JOIN user_friends uf ON v.user_id = uf.friend_id
  JOIN profiles p ON v.user_id = p.id
  JOIN wineries w ON v.winery_id = w.id
  ORDER BY v.created_at DESC
  LIMIT limit_val;
END;
$$;

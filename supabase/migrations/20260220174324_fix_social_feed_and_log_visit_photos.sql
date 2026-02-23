-- 1. Correct log_visit to properly handle the photos array from input
CREATE OR REPLACE FUNCTION log_visit(
  p_winery_data jsonb,
  p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
BEGIN
  -- Upsert Winery
  INSERT INTO wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (p_winery_data->>'lat')::numeric,
    (p_winery_data->>'lng')::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    google_rating = EXCLUDED.google_rating
  RETURNING id INTO v_winery_id;

  -- Insert Visit with photos from input
  INSERT INTO visits (
    user_id,
    winery_id,
    visit_date,
    user_review,
    rating,
    photos
  )
  VALUES (
    auth.uid(),
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_visit_data->'photos', '[]'::jsonb)))
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

-- 2. Harden get_friend_activity_feed with LEFT JOIN on profiles and fallbacks
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
    v.user_id,
    COALESCE(p.name, 'Someone')::text as user_name,
    COALESCE(p.email, 'unknown')::text as user_email,
    w.id as winery_id,
    w.name::text as winery_name,
    v.rating as visit_rating,
    v.user_review as visit_review,
    COALESCE(v.photos, ARRAY[]::text[]) as visit_photos
  FROM visits v
  JOIN user_friends uf ON v.user_id = uf.friend_id
  JOIN wineries w ON v.winery_id = w.id
  LEFT JOIN profiles p ON v.user_id = p.id  -- Use LEFT JOIN to prevent missing profiles from hiding visits
  ORDER BY v.created_at DESC
  LIMIT limit_val;
END;
$$;

-- Migration: Create RPCs for transactional logic (Find-or-Create patterns)

-- 1. log_visit
CREATE OR REPLACE FUNCTION log_visit(
  p_winery_data jsonb,
  p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Insert Visit
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
    ARRAY[]::text[] -- Initialize with empty photos array
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

GRANT EXECUTE ON FUNCTION log_visit(jsonb, jsonb) TO authenticated;

-- 2. add_to_wishlist
CREATE OR REPLACE FUNCTION add_to_wishlist(
  p_winery_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winery_id integer;
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
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Insert into Wishlist (ignore duplicates)
  INSERT INTO wishlist (user_id, winery_id)
  VALUES (auth.uid(), v_winery_id)
  ON CONFLICT (user_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;

GRANT EXECUTE ON FUNCTION add_to_wishlist(jsonb) TO authenticated;

-- 3. add_winery_to_trip
CREATE OR REPLACE FUNCTION add_winery_to_trip(
  p_trip_id integer,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winery_id integer;
  v_max_order integer;
  v_is_member boolean;
BEGIN
  -- Check permission
  SELECT EXISTS (
    SELECT 1 FROM trips 
    WHERE id = p_trip_id AND (user_id = auth.uid() OR auth.uid() = ANY(members))
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

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
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Get max order
  SELECT COALESCE(MAX(visit_order), -1) INTO v_max_order
  FROM trip_wineries
  WHERE trip_id = p_trip_id;

  -- Insert into Trip Wineries
  INSERT INTO trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (p_trip_id, v_winery_id, v_max_order + 1, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;

GRANT EXECUTE ON FUNCTION add_winery_to_trip(integer, jsonb, text) TO authenticated;

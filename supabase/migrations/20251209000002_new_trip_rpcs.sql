-- Migration: Add additional RPCs for trip management

-- 1. create_trip_with_winery
CREATE OR REPLACE FUNCTION create_trip_with_winery(
  p_trip_name character varying(255),
  p_trip_date date,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL,
  p_members uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winery_id integer;
  v_trip_id integer;
BEGIN
  -- Upsert Winery (using ensure_winery logic)
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

  -- Create Trip
  INSERT INTO trips (user_id, trip_date, name, members)
  VALUES (auth.uid(), p_trip_date, p_trip_name, COALESCE(p_members, ARRAY[auth.uid()]))
  RETURNING id INTO v_trip_id;

  -- Add Winery to Trip
  INSERT INTO trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (v_trip_id, v_winery_id, 0, p_notes); -- Initial winery gets order 0

  RETURN jsonb_build_object('trip_id', v_trip_id, 'winery_id', v_winery_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_trip_with_winery(character varying, date, jsonb, text, uuid[]) TO authenticated;

-- 2. remove_winery_from_trip
CREATE OR REPLACE FUNCTION remove_winery_from_trip(
  p_trip_id integer,
  p_winery_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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

  DELETE FROM trip_wineries
  WHERE trip_id = p_trip_id AND winery_id = p_winery_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION remove_winery_from_trip(integer, integer) TO authenticated;

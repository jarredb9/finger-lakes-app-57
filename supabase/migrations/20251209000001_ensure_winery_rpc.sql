-- Migration: Add ensure_winery RPC

CREATE OR REPLACE FUNCTION ensure_winery(
  p_winery_data jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winery_id integer;
BEGIN
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

  RETURN v_winery_id;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_winery(jsonb) TO authenticated;

-- Secure get_wineries_in_bounds by explicitly setting search_path
CREATE OR REPLACE FUNCTION public.get_wineries_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS SETOF public.wineries
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM wineries
  WHERE
    latitude >= min_lat AND
    latitude <= max_lat AND
    longitude >= min_lng AND
    longitude <= max_lng;
$$;

GRANT EXECUTE ON FUNCTION public.get_wineries_in_bounds(double precision, double precision, double precision, double precision) TO authenticated;

-- Secure upsert_wineries_from_search by explicitly setting search_path
CREATE OR REPLACE FUNCTION public.upsert_wineries_from_search(
  wineries_data jsonb[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  winery_record jsonb;
BEGIN
  FOREACH winery_record IN ARRAY wineries_data
  LOOP
    INSERT INTO wineries (
      google_place_id,
      name,
      address,
      latitude,
      longitude,
      google_rating
    )
    VALUES (
      winery_record->>'google_place_id',
      winery_record->>'name',
      winery_record->>'address',
      (winery_record->>'latitude')::double precision,
      (winery_record->>'longitude')::double precision,
      (winery_record->>'google_rating')::double precision
    )
    ON CONFLICT (google_place_id) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_wineries_from_search(jsonb[]) TO authenticated;

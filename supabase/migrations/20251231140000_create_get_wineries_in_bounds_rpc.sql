-- This function retrieves all wineries within a given geographical bounding box.
-- It's used to check our local database for wineries before calling an external API.
CREATE OR REPLACE FUNCTION get_wineries_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS SETOF wineries
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM wineries
  WHERE
    latitude >= min_lat AND
    latitude <= max_lat AND
    longitude >= min_lng AND
    longitude <= max_lng;
$$;

GRANT EXECUTE ON FUNCTION get_wineries_in_bounds(double precision, double precision, double precision, double precision) TO authenticated;

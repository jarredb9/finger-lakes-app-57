-- This function allows for bulk upserting of wineries based on search results from an external API (e.g., Google Places).
-- It's designed to be called with an array of winery data.
--
-- On conflict (based on google_place_id), it does nothing to avoid overwriting more detailed information
-- that might have been fetched separately (e.g., website, phone number from a get_winery_details call).
-- This keeps the basic search data from clobbering richer, user-requested data.

CREATE OR REPLACE FUNCTION upsert_wineries_from_search(
  wineries_data jsonb[]
)
RETURNS void
LANGUAGE plpgsql
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

GRANT EXECUTE ON FUNCTION upsert_wineries_from_search(jsonb[]) TO authenticated;

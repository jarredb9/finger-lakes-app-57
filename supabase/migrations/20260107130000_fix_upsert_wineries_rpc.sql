CREATE OR REPLACE FUNCTION public.upsert_wineries_from_search(wineries_data jsonb[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ON CONFLICT (google_place_id) 
    DO UPDATE SET
        google_rating = COALESCE(EXCLUDED.google_rating, wineries.google_rating),
        -- Also update basic info in case it changed/improved
        name = COALESCE(EXCLUDED.name, wineries.name),
        address = COALESCE(EXCLUDED.address, wineries.address),
        latitude = COALESCE(EXCLUDED.latitude, wineries.latitude),
        longitude = COALESCE(EXCLUDED.longitude, wineries.longitude);
  END LOOP;
END;
$function$;

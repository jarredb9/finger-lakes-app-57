-- Migration: 20261002120000_standardize_add_winery_to_trip_coordinates.sql
-- Description: Standardize coordinate extraction in add_winery_to_trip to accept latitude/longitude and lat/lng (Issue #57)

CREATE OR REPLACE FUNCTION "public"."add_winery_to_trip"(
  "p_trip_id" integer,
  "p_winery_data" "jsonb",
  "p_notes" "text" DEFAULT NULL::"text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_max_order integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
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
  FROM public.trip_wineries
  WHERE trip_id = p_trip_id;

  -- Insert into Trip Wineries
  INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (p_trip_id, v_winery_id, v_max_order + 1, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") TO "authenticated";

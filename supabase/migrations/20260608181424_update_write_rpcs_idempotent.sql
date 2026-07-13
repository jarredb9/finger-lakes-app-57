-- Drop old overloaded function signatures to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS "public"."create_trip"("p_name" "text", "p_trip_date" "date");
DROP FUNCTION IF EXISTS "public"."create_trip_with_winery"("p_trip_name" character varying, "p_trip_date" "date", "p_winery_data" "jsonb", "p_notes" "text", "p_members" "uuid"[]);
DROP FUNCTION IF EXISTS "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb");
DROP FUNCTION IF EXISTS "public"."update_visit"("p_visit_id" integer, "p_visit_data" "jsonb");

-- Update create_trip to support idempotency key
CREATE OR REPLACE FUNCTION "public"."create_trip"(
  "p_name" "text",
  "p_trip_date" "date",
  "p_idempotency_key" "uuid" DEFAULT NULL::"uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_trip_id integer;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_trip_id
    FROM public.trips
    WHERE idempotency_key = p_idempotency_key;
    
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_trip_id,
        'user_id', auth.uid(),
        'trip_date', p_trip_date,
        'name', p_name
      );
    END IF;
  END IF;

  -- 1. Create Trip
  INSERT INTO public.trips (user_id, trip_date, name, idempotency_key)
  VALUES (auth.uid(), p_trip_date, p_name, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_trip_id;

  -- If insert yielded nothing due to concurrency race, query it again
  IF v_trip_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_trip_id FROM public.trips WHERE idempotency_key = p_idempotency_key;
  END IF;

  -- 2. Add creator to trip_members join table as owner
  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  VALUES (v_trip_id, auth.uid(), 'owner', 'joined')
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- 3. Return the new trip record
  RETURN jsonb_build_object(
    'id', v_trip_id,
    'user_id', auth.uid(),
    'trip_date', p_trip_date,
    'name', p_name
  );
END;
$$;

-- Update create_trip_with_winery to support idempotency key
CREATE OR REPLACE FUNCTION "public"."create_trip_with_winery"(
  "p_trip_name" character varying,
  "p_trip_date" "date",
  "p_winery_data" "jsonb",
  "p_notes" "text" DEFAULT NULL::"text",
  "p_members" "uuid"[] DEFAULT NULL::"uuid"[],
  "p_idempotency_key" "uuid" DEFAULT NULL::"uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_trip_id integer;
  v_members uuid[];
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id, tw.winery_id INTO v_trip_id, v_winery_id
    FROM public.trips t
    LEFT JOIN public.trip_wineries tw ON t.id = tw.trip_id
    WHERE t.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('trip_id', v_trip_id, 'winery_id', v_winery_id);
    END IF;
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

  -- Default members to include creator
  v_members := COALESCE(p_members, ARRAY[v_user_id]);
  IF NOT (v_user_id = ANY(v_members)) THEN
    v_members := array_append(v_members, v_user_id);
  END IF;

  -- Create Trip
  INSERT INTO public.trips (user_id, trip_date, name, idempotency_key)
  VALUES (v_user_id, p_trip_date, p_trip_name, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_trip_id;

  IF v_trip_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_trip_id FROM public.trips WHERE idempotency_key = p_idempotency_key;
  END IF;

  -- Add members to trip_members join table
  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  SELECT v_trip_id, u_id, 
         CASE WHEN u_id = v_user_id THEN 'owner' ELSE 'member' END,
         'joined'
  FROM unnest(v_members) as u_id
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- Add Winery to Trip
  INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (v_trip_id, v_winery_id, 0, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('trip_id', v_trip_id, 'winery_id', v_winery_id);
END;
$$;

-- Update log_visit to support idempotency key
CREATE OR REPLACE FUNCTION "public"."log_visit"(
  "p_winery_data" "jsonb",
  "p_visit_data" "jsonb",
  "p_idempotency_key" "uuid" DEFAULT NULL::"uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
  v_photos text[];
  v_is_private boolean;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, winery_id INTO v_visit_id, v_winery_id
    FROM public.visits
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
    END IF;
  END IF;

  -- Extract photos array safely
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') t(x)),
    ARRAY[]::text[]
  ) INTO v_photos;

  -- Extract is_private flag
  v_is_private := COALESCE((p_visit_data->>'is_private')::boolean, false);

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
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    google_rating = EXCLUDED.google_rating
  RETURNING id INTO v_winery_id;

  -- Insert Visit
  INSERT INTO public.visits (
    user_id,
    winery_id,
    visit_date,
    user_review,
    rating,
    photos,
    is_private,
    idempotency_key
  )
  VALUES (
    (SELECT auth.uid()),
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    v_is_private,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_visit_id;

  IF v_visit_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_visit_id FROM public.visits WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

-- Update update_visit to support idempotency key
CREATE OR REPLACE FUNCTION "public"."update_visit"(
  "p_visit_id" integer,
  "p_visit_data" "jsonb",
  "p_idempotency_key" "uuid" DEFAULT NULL::"uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_updated_record record;
    v_visit_id integer;
BEGIN
    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_visit_id
      FROM public.visits
      WHERE idempotency_key = p_idempotency_key;

      IF FOUND THEN
        RETURN (
          SELECT jsonb_build_object(
              'id', v.id,
              'user_id', v.user_id,
              'visit_date', v.visit_date,
              'rating', v.rating,
              'user_review', v.user_review,
              'photos', v.photos,
              'is_private', v.is_private,
              'winery_id', v.winery_id,
              'winery_name', w.name,
              'winery_address', w.address,
              'google_place_id', w.google_place_id,
              'latitude', w.latitude,
              'longitude', w.longitude,
              'lat', w.latitude,
              'lng', w.longitude
          )
          FROM public.visits v
          JOIN public.wineries w ON v.winery_id = w.id
          WHERE v.id = v_visit_id
        );
      END IF;
    END IF;

    UPDATE public.visits
    SET 
        visit_date = COALESCE((p_visit_data->>'visit_date')::date, visit_date),
        user_review = COALESCE(p_visit_data->>'user_review', user_review),
        rating = COALESCE((p_visit_data->>'rating')::integer, rating),
        photos = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') x), photos),
        is_private = COALESCE((p_visit_data->>'is_private')::boolean, is_private),
        idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
        updated_at = NOW()
    WHERE id = p_visit_id AND user_id = v_user_id
    RETURNING * INTO v_updated_record;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'id', v.id,
            'user_id', v.user_id,
            'visit_date', v.visit_date,
            'rating', v.rating,
            'user_review', v.user_review,
            'photos', v.photos,
            'is_private', v.is_private,
            'winery_id', v.winery_id,
            'winery_name', w.name,
            'winery_address', w.address,
            'google_place_id', w.google_place_id,
            'latitude', w.latitude,
            'longitude', w.longitude,
            'lat', w.latitude,
            'lng', w.longitude
        )
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        WHERE v.id = v_updated_record.id
    );
END;
$$;

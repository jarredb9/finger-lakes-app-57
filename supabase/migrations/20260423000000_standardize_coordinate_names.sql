-- Migration: 20260423000000_standardize_coordinate_names.sql
-- Goal: Standardize all RPCs to use 'latitude' and 'longitude' for JSON keys and return columns.

-- Drop functions with changing return types to allow recreation
DROP FUNCTION IF EXISTS public.get_paginated_trips_with_wineries(text, integer, integer);
DROP FUNCTION IF EXISTS public.get_trip_by_id_with_wineries(integer);
DROP FUNCTION IF EXISTS public.get_winery_details_by_id(integer);
DROP FUNCTION IF EXISTS public.get_paginated_visits_with_winery_and_friends(integer, integer);

-- 1. Update get_paginated_trips_with_wineries
CREATE OR REPLACE FUNCTION public.get_paginated_trips_with_wineries(trip_type text, page_number integer, page_size integer)
 RETURNS TABLE(id integer, user_id uuid, trip_date date, name character varying, created_at timestamp with time zone, wineries jsonb, total_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    _total_count bigint;
BEGIN
    SELECT COUNT(t.id)
    INTO _total_count
    FROM public.trips t
    WHERE public.is_trip_member(t.id)
      AND CASE
            WHEN trip_type = 'upcoming' THEN t.trip_date >= CURRENT_DATE
            WHEN trip_type = 'past' THEN t.trip_date < CURRENT_DATE
            ELSE TRUE 
          END;

    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', w.google_place_id,
                    'dbId', w.id,
                    'name', w.name,
                    'address', w.address,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'lat', w.latitude,
                    'lng', w.longitude,
                    'phone', w.phone,
                    'website', w.website,
                    'rating', w.google_rating,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order
                ) ORDER BY tw.visit_order
            )
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = t.id
        ), '[]'::jsonb) as wineries,
        _total_count
    FROM trips t
    WHERE public.is_trip_member(t.id)
      AND CASE
            WHEN trip_type = 'upcoming' THEN t.trip_date >= CURRENT_DATE
            WHEN trip_type = 'past' THEN t.trip_date < CURRENT_DATE
            ELSE TRUE
          END
    ORDER BY
        CASE WHEN trip_type = 'upcoming' THEN t.trip_date END ASC,
        CASE WHEN trip_type = 'past' THEN t.trip_date END DESC
    OFFSET (page_number - 1) * page_size
    LIMIT page_size;
END;
$function$;

-- 2. Update get_trip_by_id_with_wineries
CREATE OR REPLACE FUNCTION public.get_trip_by_id_with_wineries(trip_id_param integer)
 RETURNS TABLE(id integer, user_id uuid, trip_date date, name character varying, created_at timestamp with time zone, wineries jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', w.google_place_id,
                    'dbId', w.id,
                    'name', w.name,
                    'address', w.address,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'lat', w.latitude,
                    'lng', w.longitude,
                    'phone', w.phone,
                    'website', w.website,
                    'rating', w.google_rating,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order
                ) ORDER BY tw.visit_order
            )
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = t.id
        ), '[]'::jsonb) as wineries
    FROM trips t
    WHERE t.id = trip_id_param
      AND public.is_trip_member(t.id);
END;
$function$;

-- 3. Update get_winery_details_by_id
CREATE OR REPLACE FUNCTION public.get_winery_details_by_id(winery_id_param integer)
 RETURNS TABLE(
    id integer, 
    google_place_id text, 
    name text, 
    address text, 
    latitude numeric,
    longitude numeric,
    lat numeric,
    lng numeric,
    phone text, 
    website text, 
    google_rating numeric, 
    opening_hours jsonb, 
    reviews jsonb, 
    reservable boolean, 
    is_favorite boolean, 
    on_wishlist boolean, 
    user_visited boolean, 
    is_favorite_private boolean,
    on_wishlist_private boolean,
    visits jsonb, 
    trip_info jsonb
)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, auth
AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.address,
        w.latitude,
        w.longitude,
        w.latitude as lat,
        w.longitude as lng,
        w.phone::text,
        w.website::text,
        w.google_rating,
        w.opening_hours,
        w.reviews,
        w.reservable,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid) as user_visited,
        COALESCE((SELECT f.is_private FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid), false) as is_favorite_private,
        COALESCE((SELECT wi.is_private FROM wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = user_uuid), false) as on_wishlist_private,
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'is_private', v.is_private
                ) ORDER BY v.visit_date DESC
            ), '[]'::jsonb)
            FROM visits v
            WHERE v.winery_id = w.id AND v.user_id = user_uuid
        ) as visits,
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'trip_id', t.id,
                    'trip_name', t.name,
                    'trip_date', t.trip_date,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order
                ) ORDER BY t.trip_date ASC, tw.visit_order ASC
            ), '[]'::jsonb)
            FROM trip_wineries tw
            JOIN trips t ON tw.trip_id = t.id
            WHERE tw.winery_id = w.id 
            AND (
                t.user_id = user_uuid 
                OR EXISTS (
                    SELECT 1 FROM trip_members tm 
                    WHERE tm.trip_id = t.id AND tm.user_id = user_uuid
                )
            )
            AND t.trip_date >= CURRENT_DATE
        ) as trip_info
    FROM
        wineries w
    WHERE
        w.id = winery_id_param;
END;
$$;

-- 4. Update get_paginated_visits_with_winery_and_friends
CREATE OR REPLACE FUNCTION public.get_paginated_visits_with_winery_and_friends(
    page_number int,
    page_size int
)
RETURNS TABLE (
    visit_id integer,
    visit_date date,
    user_review text,
    rating integer,
    photos text[],
    winery_id integer,
    winery_name character varying(255),
    winery_address text,
    google_place_id character varying(255),
    latitude numeric,
    longitude numeric,
    lat numeric,
    lng numeric,
    friend_visits jsonb
) AS $$
BEGIN
    RETURN QUERY
    WITH user_and_friends_visits AS (
        SELECT
            v.id as visit_id,
            v.visit_date,
            v.user_review,
            v.rating,
            v.photos,
            v.winery_id,
            w.name as winery_name,
            w.address as winery_address,
            w.google_place_id::character varying(255),
            w.latitude,
            w.longitude,
            w.latitude as lat,
            w.longitude as lng,
            v.user_id
        FROM visits v
        JOIN wineries w ON v.winery_id = w.id
        WHERE v.user_id = auth.uid() OR v.user_id IN (SELECT friend_id FROM get_friends_ids())
    ),
    aggregated_friend_visits AS (
        SELECT
            fv.winery_id,
            fv.visit_date,
            jsonb_agg(jsonb_build_object(
                'user_id', fv.user_id,
                'name', p.name,
                'rating', fv.rating,
                'user_review', fv.user_review
            )) as friend_visits
        FROM user_and_friends_visits fv
        JOIN profiles p ON fv.user_id = p.id
        WHERE fv.user_id != auth.uid()
        GROUP BY fv.winery_id, fv.visit_date
    )
    SELECT
        uv.visit_id,
        uv.visit_date,
        uv.user_review,
        uv.rating,
        uv.photos,
        uv.winery_id,
        uv.winery_name,
        uv.winery_address,
        uv.google_place_id,
        uv.latitude,
        uv.longitude,
        uv.latitude as lat,
        uv.longitude as lng,
        afv.friend_visits
    FROM user_and_friends_visits uv
    LEFT JOIN aggregated_friend_visits afv ON uv.winery_id = afv.winery_id AND uv.visit_date = afv.visit_date
    WHERE uv.user_id = auth.uid()
    ORDER BY uv.visit_date DESC, uv.visit_id DESC
    LIMIT page_size
    OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

-- 5. Update create_trip_with_winery
CREATE OR REPLACE FUNCTION public.create_trip_with_winery(
  p_trip_name character varying(255),
  p_trip_date date,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL,
  p_members uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
  -- Ensure creator is in members if p_members was provided but missed creator
  IF NOT (v_user_id = ANY(v_members)) THEN
    v_members := array_append(v_members, v_user_id);
  END IF;

  -- Create Trip
  INSERT INTO public.trips (user_id, trip_date, name)
  VALUES (v_user_id, p_trip_date, p_trip_name)
  RETURNING id INTO v_trip_id;

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

-- 6. Update log_visit
DROP FUNCTION IF EXISTS public.log_visit(jsonb, date, text, integer, text[], boolean);
CREATE OR REPLACE FUNCTION public.log_visit(
  p_winery_data jsonb,
  p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
  v_photos text[];
  v_is_private boolean;
BEGIN
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
    is_private
  )
  VALUES (
    (SELECT auth.uid()),
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    v_is_private
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

-- 7. Update ensure_winery
CREATE OR REPLACE FUNCTION public.ensure_winery(p_winery_data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, auth
AS $function$
DECLARE
  v_winery_id integer;
BEGIN
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

  RETURN v_winery_id;
END;
$function$;

-- 8. Update add_to_wishlist
CREATE OR REPLACE FUNCTION public.add_to_wishlist(p_winery_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_winery_id integer;
  v_is_private boolean;
BEGIN
  v_is_private := COALESCE((p_winery_data->>'is_private')::boolean, false);

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

  -- Insert into Wishlist
  INSERT INTO public.wishlist (user_id, winery_id, is_private)
  VALUES (auth.uid(), v_winery_id, v_is_private)
  ON CONFLICT (user_id, winery_id) 
  DO UPDATE SET is_private = EXCLUDED.is_private;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;

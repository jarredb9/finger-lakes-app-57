-- Synchronize RPCs with remote database state
-- This removes legacy 'members' column references, unused overloads, and fixes lint errors

-- 0. Enable PostGIS (Required for search_wineries_by_name_and_location)
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

-- 1. Update get_paginated_trips_with_wineries to remove 'members' column
DROP FUNCTION IF EXISTS public.get_paginated_trips_with_wineries(text, integer, integer);
CREATE OR REPLACE FUNCTION public.get_paginated_trips_with_wineries(trip_type text, page_number integer, page_size integer)
 RETURNS TABLE(id integer, user_id uuid, trip_date date, name character varying, created_at timestamp with time zone, wineries jsonb, total_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    _total_count bigint;
BEGIN
    -- Calculate total count first
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

-- 2. Update get_trip_by_id_with_wineries to remove 'members' column
DROP FUNCTION IF EXISTS public.get_trip_by_id_with_wineries(integer);
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

-- 3. Fix get_user_dashboard ambiguity and formatting
CREATE OR REPLACE FUNCTION public.get_user_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'profile', (
            SELECT to_jsonb(p) - 'email' FROM profiles p WHERE p.id = v_user_id
        ),
        'friend_requests_received', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'requester_id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = v_user_id AND f.status = 'pending'
        ),
        'friend_requests_sent', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'receiver_id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        ),
        'upcoming_trips', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'trip_date', t.trip_date
                )
            ORDER BY t.trip_date ASC), '[]'::jsonb)
            FROM trips t
            WHERE (
                t.user_id = v_user_id 
                OR EXISTS (
                    SELECT 1 FROM trip_members tm 
                    WHERE tm.trip_id = t.id AND tm.user_id = v_user_id
                )
            ) 
            AND t.trip_date >= CURRENT_DATE
        ),
        'recent_visits', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'winery_id', v.winery_id,
                    'winery_name', w.name,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos
                )
            ORDER BY v.visit_date DESC), '[]'::jsonb)
            FROM visits v
            JOIN wineries w ON v.winery_id = w.id
            WHERE v.user_id = v_user_id
            LIMIT 5 
        )
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

-- 4. Fix type mismatches (text vs varchar) in winery RPCs
CREATE OR REPLACE FUNCTION public.get_all_wineries_with_user_data()
 RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::character varying, -- Explicit cast for linter
        w.website::character varying, -- Explicit cast for linter
        w.google_rating,
        COALESCE(bool_or(f.user_id IS NOT NULL), false) as is_favorite,
        COALESCE(bool_or(wl.user_id IS NOT NULL), false) as on_wishlist,
        COALESCE(bool_or(v.user_id IS NOT NULL), false) as user_visited
    FROM wineries w
    LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    LEFT JOIN visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
    GROUP BY w.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wineries_for_trip_planner(trip_date_param date)
 RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, trip_id integer, trip_name character varying, trip_date date, visit_order integer, notes text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH user_trips AS (
        SELECT t.id, t.name, t.trip_date
        FROM trips t
        WHERE t.user_id = auth.uid() AND t.trip_date = trip_date_param
    ),
    wineries_in_trips AS (
        SELECT
            tw.winery_id,
            ut.id as trip_id,
            ut.name as trip_name,
            ut.trip_date,
            tw.visit_order,
            tw.notes
        FROM trip_wineries tw
        JOIN user_trips ut ON tw.trip_id = ut.id
    )
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::character varying, -- Explicit cast
        w.website::character varying, -- Explicit cast
        w.google_rating,
        COALESCE(bool_or(f.user_id IS NOT NULL), false) as is_favorite,
        COALESCE(bool_or(wl.user_id IS NOT NULL), false) as on_wishlist,
        COALESCE(bool_or(v.user_id IS NOT NULL), false) as user_visited,
        wit.trip_id,
        wit.trip_name,
        wit.trip_date,
        wit.visit_order,
        wit.notes
    FROM wineries w
    JOIN wineries_in_trips wit ON w.id = wit.winery_id
    LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    LEFT JOIN visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
    GROUP BY w.id, wit.trip_id, wit.trip_name, wit.trip_date, wit.visit_order, wit.notes;
END;
$function$;

-- 4.5. Fix type mismatch in get_winery_details
CREATE OR REPLACE FUNCTION public.get_winery_details(winery_id_param integer)
 RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, visits jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_visits jsonb;
BEGIN
    SELECT jsonb_agg(v_agg)
    INTO v_visits
    FROM (
        SELECT v.id, v.visit_date, v.user_review, v.rating, v.photos
        FROM visits v
        WHERE v.winery_id = winery_id_param AND v.user_id = auth.uid()
        ORDER BY v.visit_date DESC
    ) AS v_agg;

    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::character varying, -- Explicit cast
        w.website::character varying, -- Explicit cast
        w.google_rating,
        f.user_id IS NOT NULL AS is_favorite,
        wl.user_id IS NOT NULL AS on_wishlist,
        v_visits IS NOT NULL AND jsonb_array_length(v_visits) > 0 AS user_visited,
        v_visits AS visits
    FROM wineries w
    LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    WHERE w.id = winery_id_param;
END;
$function$;

-- 4.7. Fix geography type and structure in search_wineries_by_name_and_location
CREATE OR REPLACE FUNCTION public.search_wineries_by_name_and_location(search_query text, user_lat double precision, user_lng double precision)
 RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, distance_meters double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH winery_matches AS (
        SELECT
            w.id,
            w.google_place_id,
            w.name,
            w.address,
            w.latitude,
            w.longitude,
            w.phone::character varying as phone,
            w.website::character varying as website,
            w.google_rating,
            bool_or(f.user_id IS NOT NULL) as is_favorite,
            bool_or(wl.user_id IS NOT NULL) as on_wishlist,
            bool_or(v.user_id IS NOT NULL) as user_visited
        FROM wineries w
        LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
        LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
        LEFT JOIN visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
        WHERE w.name ILIKE '%' || search_query || '%'
        GROUP BY w.id
    )
    SELECT
        wm.id,
        wm.google_place_id,
        wm.name,
        wm.address,
        wm.latitude,
        wm.longitude,
        wm.phone,
        wm.website,
        wm.google_rating,
        wm.is_favorite,
        wm.on_wishlist,
        wm.user_visited,
        extensions.ST_Distance(
            extensions.ST_MakePoint(wm.longitude::double precision, wm.latitude::double precision)::extensions.geography,
            extensions.ST_MakePoint(user_lng, user_lat)::extensions.geography
        ) as distance_meters
    FROM winery_matches wm
    ORDER BY distance_meters;
END;
$function$;

-- 4.9. Fix search path for create_trip_with_winery
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

-- 4.9.5. Fix search path for log_visit
DROP FUNCTION IF EXISTS public.log_visit(jsonb, jsonb);
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
BEGIN
  -- Extract photos array safely
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') t(x)),
    ARRAY[]::text[]
  ) INTO v_photos;

  -- Upsert Winery
  INSERT INTO public.wineries (
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
  INSERT INTO public.visits (
    user_id,
    winery_id,
    visit_date,
    user_review,
    rating,
    photos
  )
  VALUES (
    (SELECT auth.uid()),
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

-- 4.9.7. Fix search path for ensure_winery
CREATE OR REPLACE FUNCTION public.ensure_winery(p_winery_data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- 5. Drop unused get_user_trips_with_wineries
DROP FUNCTION IF EXISTS public.get_user_trips_with_wineries();

-- 6. Drop log_visit overload (Keeping the version that takes two JSONB params)
DROP FUNCTION IF EXISTS public.log_visit(jsonb, date, text, integer, text[], boolean);

GRANT EXECUTE ON FUNCTION public.get_paginated_trips_with_wineries(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_by_id_with_wineries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_wineries_with_user_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wineries_for_trip_planner(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winery_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_wineries_by_name_and_location(text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_winery(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_with_winery(character varying, date, jsonb, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_visit(jsonb, jsonb) TO authenticated;

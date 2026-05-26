-- Migration: 20260423000001_fix_missed_coordinate_standardization.sql
-- Goal: Fix missed RPCs and standardize argument names for coordinate-related functions.

-- 1. Update get_all_user_visits_list
DROP FUNCTION IF EXISTS public.get_all_user_visits_list();
CREATE OR REPLACE FUNCTION public.get_all_user_visits_list()
RETURNS TABLE (
    id integer,
    visit_date date,
    rating integer,
    user_review text,
    photos text[],
    winery_id integer,
    winery_name text,
    winery_address text,
    google_place_id text,
    latitude numeric,
    longitude numeric,
    lat numeric,
    lng numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.visit_date,
        v.rating,
        v.user_review,
        v.photos,
        w.id as winery_id,
        w.name::text as winery_name,
        w.address,
        w.google_place_id,
        w.latitude,
        w.longitude,
        w.latitude as lat,
        w.longitude as lng
    FROM
        visits v
    JOIN
        wineries w ON v.winery_id = w.id
    WHERE
        v.user_id = auth.uid()
    ORDER BY
        v.visit_date DESC;
END;
$$;

-- 2. Update get_trip_details
DROP FUNCTION IF EXISTS public.get_trip_details(integer);
CREATE OR REPLACE FUNCTION public.get_trip_details(trip_id_param integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, auth
AS $$
DECLARE
    v_trip_record record;
    v_result jsonb;
    v_user_uuid uuid := auth.uid();
BEGIN
    -- 1. Get basic trip info and verify membership
    SELECT t.* INTO v_trip_record
    FROM public.trips t
    WHERE t.id = trip_id_param;

    IF v_trip_record IS NULL THEN
        RETURN NULL;
    END IF;

    -- Verify access
    IF NOT public.is_trip_member(trip_id_param) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- 2. Build the structured response
    SELECT jsonb_build_object(
        'id', v_trip_record.id,
        'user_id', v_trip_record.user_id,
        'trip_date', v_trip_record.trip_date,
        'name', v_trip_record.name,
        'created_at', v_trip_record.created_at,
        'updated_at', v_trip_record.updated_at,
        'members', (
            SELECT COALESCE(jsonb_agg(row_to_json(m_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    p.id,
                    p.name,
                    p.email,
                    tm.role,
                    tm.status
                FROM public.trip_members tm
                JOIN public.profiles p ON tm.user_id = p.id
                WHERE tm.trip_id = trip_id_param
            ) m_data
        ),
        'wineries', (
            SELECT COALESCE(jsonb_agg(row_to_json(w_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    w.id as "dbId",
                    w.google_place_id as id,
                    w.name,
                    w.address,
                    w.latitude,
                    w.longitude,
                    w.latitude as lat,
                    w.longitude as lng,
                    tw.visit_order,
                    tw.notes,
                    tw.updated_at,
                    (
                        SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
                        FROM (
                            SELECT 
                                v.id,
                                v.visit_date,
                                v.user_review,
                                v.rating,
                                v.user_id,
                                COALESCE(v.photos, ARRAY[]::text[]) as photos,
                                p.name as user_name
                            FROM public.visits v
                            JOIN public.profiles p ON v.user_id = p.id
                            WHERE v.winery_id = w.id
                              AND (
                                  v.user_id = v_trip_record.user_id 
                                  OR 
                                  EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = trip_id_param AND user_id = v.user_id)
                              )
                              AND public.is_visible_to_viewer(v.user_id, v.is_private)
                        ) v_data
                    ) as visits
                FROM public.trip_wineries tw
                JOIN public.wineries w ON tw.winery_id = w.id
                WHERE tw.trip_id = trip_id_param
                ORDER BY tw.visit_order ASC
            ) w_data
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 3. Update get_wineries_in_bounds (Standardize argument names)
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_wineries_in_bounds(
  min_latitude double precision DEFAULT NULL,
  min_longitude double precision DEFAULT NULL,
  max_latitude double precision DEFAULT NULL,
  max_longitude double precision DEFAULT NULL,
  min_lat double precision DEFAULT NULL,
  min_lng double precision DEFAULT NULL,
  max_lat double precision DEFAULT NULL,
  max_lng double precision DEFAULT NULL
)
RETURNS SETOF public.wineries
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM wineries
  WHERE
    latitude >= COALESCE(min_latitude, min_lat) AND
    latitude <= COALESCE(max_latitude, max_lat) AND
    longitude >= COALESCE(min_longitude, min_lng) AND
    longitude <= COALESCE(max_longitude, max_lng);
$$;

-- 4. Update search_wineries_by_name_and_location (Standardize argument names)
DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision);
DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.search_wineries_by_name_and_location(
    search_query text, 
    user_latitude double precision DEFAULT NULL, 
    user_longitude double precision DEFAULT NULL,
    user_lat double precision DEFAULT NULL,
    user_lng double precision DEFAULT NULL
)
 RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, lat numeric, lng numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, distance_meters double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    final_user_lat double precision := COALESCE(user_latitude, user_lat);
    final_user_lng double precision := COALESCE(user_longitude, user_lng);
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
        wm.latitude as lat,
        wm.longitude as lng,
        wm.phone,
        wm.website,
        wm.google_rating,
        wm.is_favorite,
        wm.on_wishlist,
        wm.user_visited,
        extensions.ST_Distance(
            extensions.ST_MakePoint(wm.longitude::double precision, wm.latitude::double precision)::extensions.geography,
            extensions.ST_MakePoint(final_user_lng, final_user_lat)::extensions.geography
        ) as distance_meters
    FROM winery_matches wm
    ORDER BY distance_meters;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_all_user_visits_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_wineries_by_name_and_location(text, double precision, double precision, double precision, double precision) TO authenticated;

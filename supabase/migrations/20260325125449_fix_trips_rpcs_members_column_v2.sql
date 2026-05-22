-- Drop first because return type changed (members column removed)
DROP FUNCTION IF EXISTS public.get_paginated_trips_with_wineries(text, integer, integer);
DROP FUNCTION IF EXISTS public.get_trip_by_id_with_wineries(integer);

-- Fix get_paginated_trips_with_wineries to remove non-existent members column and use is_trip_member for auth
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

-- Fix get_trip_by_id_with_wineries to remove non-existent members column and use is_trip_member for auth
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

GRANT EXECUTE ON FUNCTION public.get_paginated_trips_with_wineries(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_by_id_with_wineries(integer) TO authenticated;

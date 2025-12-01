-- Refactor remaining trip fetch operations to use Supabase RPCs.
-- This includes paginated trip lists and fetching a single trip by ID.

-- RPC to get paginated trips with their wineries
CREATE OR REPLACE FUNCTION get_paginated_trips_with_wineries(
    trip_type text,
    page_number int,
    page_size int
)
RETURNS TABLE (
    id integer,
    user_id uuid,
    trip_date date,
    name character varying(255),
    created_at timestamp with time zone,
    members uuid[],
    wineries jsonb,
    total_count bigint -- To return total count for pagination
) AS $$
DECLARE
    _total_count bigint;
BEGIN
    -- Calculate total count first
    SELECT COUNT(t.id)
    INTO _total_count
    FROM public.trips t
    WHERE (t.user_id = auth.uid() OR auth.uid() = ANY(t.members))
      AND CASE
            WHEN trip_type = 'upcoming' THEN t.trip_date >= CURRENT_DATE
            WHEN trip_type = 'past' THEN t.trip_date < CURRENT_DATE
            ELSE TRUE -- Should not happen if trip_type is validated
          END;

    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        t.members,
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
    WHERE (t.user_id = auth.uid() OR auth.uid() = ANY(t.members))
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
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_paginated_trips_with_wineries(text, int, int) TO authenticated;


-- RPC to get a single trip by ID with its wineries
CREATE OR REPLACE FUNCTION get_trip_by_id_with_wineries(trip_id_param integer)
RETURNS TABLE (
    id integer,
    user_id uuid,
    trip_date date,
    name character varying(255),
    created_at timestamp with time zone,
    members uuid[],
    wineries jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        t.members,
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
      AND (t.user_id = auth.uid() OR auth.uid() = ANY(t.members));
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_trip_by_id_with_wineries(integer) TO authenticated;
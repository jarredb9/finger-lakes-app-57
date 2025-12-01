-- Fix performance bottleneck in Trip Planner by fetching everything in one query
-- Handles: Trips + Wineries + Visits (filtered by trip date and members)

CREATE OR REPLACE FUNCTION get_trips_for_date(target_date date)
RETURNS TABLE (
    id integer,
    user_id uuid,
    trip_date date,
    name character varying(255),
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
                    'visit_order', tw.visit_order,
                    'visits', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'id', v.id,
                                'visit_date', v.visit_date,
                                'rating', v.rating,
                                'user_review', v.user_review,
                                'photos', v.photos,
                                'profiles', jsonb_build_object('name', p.name)
                            )
                        ), '[]'::jsonb)
                        FROM visits v
                        LEFT JOIN profiles p ON v.user_id = p.id
                        WHERE v.winery_id = w.id
                          AND v.visit_date = target_date -- Only visits on this trip date
                          AND (v.user_id = t.user_id OR v.user_id = ANY(t.members))
                    )
                ) ORDER BY tw.visit_order
            )
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = t.id
        ), '[]'::jsonb) as wineries
    FROM trips t
    WHERE (t.user_id = auth.uid() OR auth.uid() = ANY(t.members))
      AND t.trip_date = target_date;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_trips_for_date(date) TO authenticated;

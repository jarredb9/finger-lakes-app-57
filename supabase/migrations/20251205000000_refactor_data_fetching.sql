-- RPC for fetching lightweight map markers
-- Returns only essential data for rendering pins and basic interactions.
CREATE OR REPLACE FUNCTION get_map_markers()
RETURNS TABLE (
    id integer,
    google_place_id text,
    name text,
    lat numeric,
    lng numeric,
    address text,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean
) AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude as lat,
        w.longitude as lng,
        w.address,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid) as user_visited
    FROM
        wineries w;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_map_markers() TO authenticated;

-- RPC for fetching a single winery's full details
-- Includes current user's visits, trip info, etc.
CREATE OR REPLACE FUNCTION get_winery_details_by_id(winery_id_param integer)
RETURNS TABLE (
    id integer,
    google_place_id text,
    name text,
    address text,
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
    visits jsonb,
    trip_info jsonb
) AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.address,
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
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos
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
            WHERE tw.winery_id = w.id AND (t.user_id = user_uuid OR user_uuid = ANY(t.members))
            AND t.trip_date >= CURRENT_DATE
        ) as trip_info
    FROM
        wineries w
    WHERE
        w.id = winery_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_winery_details_by_id(integer) TO authenticated;

-- RPC for fetching all user visits for the global history list
-- Replacing the client-side aggregation
CREATE OR REPLACE FUNCTION get_all_user_visits_list()
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
    lat numeric,
    lng numeric
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_user_visits_list() TO authenticated;

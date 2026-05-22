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
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_winery_details_by_id(integer) SET search_path = public;
GRANT EXECUTE ON FUNCTION get_winery_details_by_id(integer) TO authenticated;

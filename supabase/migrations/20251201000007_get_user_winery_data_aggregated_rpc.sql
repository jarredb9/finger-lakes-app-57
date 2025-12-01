-- Mega-RPC to fetch all user-relevant wineries and their aggregated status (visited, favorited, wishlisted, part of trips).
-- This RPC aims to replace multiple client-side API calls and N+1 queries from `wineryStore.fetchWineryData`.

CREATE OR REPLACE FUNCTION get_user_winery_data_aggregated()
RETURNS TABLE (wineries_data jsonb) AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(jsonb_agg(
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
                'isFavorite', EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid),
                'onWishlist', EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid),
                'userVisited', EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid),
                'visits', (
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
                ),
                'tripInfo', (
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
                    AND t.trip_date >= CURRENT_DATE -- Only upcoming trips
                )
            )
        ), '[]'::jsonb)
    FROM
        wineries w
    WHERE
        -- Filter for wineries relevant to the current user
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM trip_wineries tw JOIN trips t ON tw.trip_id = t.id
                  WHERE tw.winery_id = w.id AND (t.user_id = user_uuid OR user_uuid = ANY(t.members)) AND t.trip_date >= CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_winery_data_aggregated() TO authenticated;

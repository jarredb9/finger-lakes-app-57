-- Migration to update get_map_markers to explicitly accept user_id_param.
-- This ensures the authentication context is correctly passed and resolves issues
-- where auth.uid() might return NULL in certain RPC contexts.

CREATE OR REPLACE FUNCTION get_map_markers(user_id_param uuid DEFAULT auth.uid())
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
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude as lat,
        w.longitude as lng,
        w.address,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_id_param) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_id_param) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_id_param) as user_visited
    FROM
        wineries w;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_map_markers(uuid) TO authenticated;

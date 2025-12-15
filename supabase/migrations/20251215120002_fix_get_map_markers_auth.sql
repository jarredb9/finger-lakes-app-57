-- Fix for get_map_markers authentication context
-- Switching from SECURITY DEFINER to SECURITY INVOKER (default) ensures auth.uid() 
-- correctly reflects the calling user and respects RLS policies.

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
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude as lat,
        w.longitude as lng,
        w.address,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = auth.uid()) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = auth.uid()) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = auth.uid()) as user_visited
    FROM
        wineries w;
END;
$$ LANGUAGE plpgsql; -- Removed SECURITY DEFINER

GRANT EXECUTE ON FUNCTION get_map_markers() TO authenticated;

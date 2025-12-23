-- RPC to fetch paginated wineries from the database with user-specific flags.
-- Includes total count for UI pagination.

CREATE OR REPLACE FUNCTION get_paginated_wineries(
    p_page integer DEFAULT 1,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    id integer,
    google_place_id text,
    name text,
    address text,
    latitude numeric,
    longitude numeric,
    phone text,
    website text,
    google_rating numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean,
    total_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_total_count bigint;
BEGIN
    -- 1. Get total count
    SELECT COUNT(*) INTO v_total_count FROM wineries;

    -- 2. Return paginated rows with flags
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::text,
        w.website::text,
        w.google_rating,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = v_user_id) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = v_user_id) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = v_user_id) as user_visited,
        v_total_count
    FROM
        wineries w
    ORDER BY
        w.name ASC
    LIMIT p_limit
    OFFSET (p_page - 1) * p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_paginated_wineries(integer, integer) TO authenticated;

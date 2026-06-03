-- Fix type mismatches in search_wineries_by_name_and_location RPC
-- Column 7 (phone) and Column 8 (website) are 'text' in the wineries table.

DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision);

CREATE OR REPLACE FUNCTION public.search_wineries_by_name_and_location(
    p_search_query text, 
    p_user_latitude double precision, 
    p_user_longitude double precision
) 
RETURNS TABLE(
    id integer, 
    google_place_id text, 
    name character varying, 
    address text, 
    latitude numeric, 
    longitude numeric, 
    phone text, 
    website text, 
    google_rating numeric, 
    is_favorite boolean, 
    on_wishlist boolean, 
    user_visited boolean, 
    distance_meters double precision
)
LANGUAGE plpgsql
SET search_path TO 'public', 'auth', 'extensions'
AS $$
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
            w.phone,
            w.website,
            w.google_rating,
            bool_or(f.user_id IS NOT NULL) as is_favorite,
            bool_or(wl.user_id IS NOT NULL) as on_wishlist,
            bool_or(v.user_id IS NOT NULL) as user_visited
        FROM public.wineries w
        LEFT JOIN public.favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
        LEFT JOIN public.wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
        LEFT JOIN public.visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
        WHERE w.name ILIKE '%' || p_search_query || '%'
        GROUP BY w.id
    )
    SELECT
        wm.*,
        extensions.ST_Distance(
            extensions.ST_MakePoint(wm.longitude::double precision, wm.latitude::double precision)::extensions.geography,
            extensions.ST_MakePoint(p_user_longitude, p_user_latitude)::extensions.geography
        ) as distance_meters
    FROM winery_matches wm
    ORDER BY distance_meters;
END;
$$;

-- 1. Drop existing functions to allow signature change (returning more columns)
DROP FUNCTION IF EXISTS public.get_map_markers();
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);

-- 2. Create updated get_map_markers with param
CREATE OR REPLACE FUNCTION public.get_map_markers(user_id_param uuid DEFAULT auth.uid())
 RETURNS TABLE(
    id integer, 
    google_place_id text, 
    name text, 
    lat numeric, 
    lng numeric, 
    address text, 
    is_favorite boolean, 
    on_wishlist boolean, 
    user_visited boolean,
    google_rating numeric,
    opening_hours jsonb,
    phone text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude as lat,
        w.longitude as lng,
        w.address,
        EXISTS(SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = user_id_param) as is_favorite,
        EXISTS(SELECT 1 FROM public.wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_id_param) as on_wishlist,
        EXISTS(SELECT 1 FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = user_id_param) as user_visited,
        w.google_rating,
        w.opening_hours,
        w.phone
    FROM
        public.wineries w;
END;
$function$;

-- 3. Restore the no-param version if needed (proxies to the param version)
CREATE OR REPLACE FUNCTION public.get_map_markers()
 RETURNS TABLE(
    id integer, 
    google_place_id text, 
    name text, 
    lat numeric, 
    lng numeric, 
    address text, 
    is_favorite boolean, 
    on_wishlist boolean, 
    user_visited boolean,
    google_rating numeric,
    opening_hours jsonb,
    phone text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY SELECT * FROM public.get_map_markers(auth.uid());
END;
$function$;

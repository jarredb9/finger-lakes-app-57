-- Security Patch: Set search_path = public for all SECURITY DEFINER functions to prevent search_path hijacking.
-- Uses DO block with exception handling since ALTER FUNCTION does not support IF EXISTS.

DO $$
BEGIN

    -- 1. Map & Wineries
    BEGIN
        ALTER FUNCTION get_map_markers(uuid) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_map_markers(uuid) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_user_winery_data_aggregated() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_user_winery_data_aggregated() not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_winery_details_by_id(integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_winery_details_by_id(integer) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION ensure_winery(jsonb) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function ensure_winery(jsonb) not found, skipping.';
    END;


    -- 2. Friends
    BEGIN
        ALTER FUNCTION get_friends_activity_for_winery(integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_friends_activity_for_winery(integer) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_friends_and_requests() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_friends_and_requests() not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION send_friend_request(text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function send_friend_request(text) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION respond_to_friend_request(uuid, boolean) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function respond_to_friend_request(uuid, boolean) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION remove_friend(uuid) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function remove_friend(uuid) not found, skipping.';
    END;


    -- 3. Trips
    BEGIN
        ALTER FUNCTION create_trip_with_winery(character varying, date, jsonb, text, uuid[]) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function create_trip_with_winery(...) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION add_winery_to_trip(integer, jsonb, text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function add_winery_to_trip(integer, jsonb, text) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION remove_winery_from_trip(integer, integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function remove_winery_from_trip(integer, integer) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_paginated_trips_with_wineries(text, integer, integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_paginated_trips_with_wineries(text, int, int) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_trip_by_id_with_wineries(integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_trip_by_id_with_wineries(integer) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_trips_for_date(date) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_trips_for_date(date) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION is_trip_member(integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function is_trip_member(integer) not found, skipping.';
    END;


    -- 4. Visits & Dashboard
    BEGIN
        ALTER FUNCTION log_visit(jsonb, jsonb) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function log_visit(jsonb, jsonb) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_all_user_visits_list() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_all_user_visits_list() not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_paginated_visits_with_winery_and_friends(integer, integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_paginated_visits_with_winery_and_friends(int, int) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_user_dashboard() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_user_dashboard() not found, skipping.';
    END;


    -- 5. User Actions
    BEGIN
        ALTER FUNCTION add_to_wishlist(jsonb) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function add_to_wishlist(jsonb) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION toggle_favorite(jsonb) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function toggle_favorite(jsonb) not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION toggle_wishlist(jsonb) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function toggle_wishlist(jsonb) not found, skipping.';
    END;


    -- 6. Misc
    BEGIN
        ALTER FUNCTION handle_new_user() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function handle_new_user() not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_friends_ids() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_friends_ids() not found, skipping.';
    END;

    BEGIN
        ALTER FUNCTION get_friends_ratings_for_winery(integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_friends_ratings_for_winery(integer) not found, skipping.';
    END;

END $$;

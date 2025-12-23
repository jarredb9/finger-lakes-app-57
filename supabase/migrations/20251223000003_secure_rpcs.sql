-- Security Patch: Set search_path = public for all SECURITY DEFINER functions to prevent search_path hijacking.
-- Uses IF EXISTS to avoid errors if specific functions are missing in the target environment.

-- 1. Map & Wineries
ALTER FUNCTION IF EXISTS get_map_markers(uuid) SET search_path = public;
ALTER FUNCTION IF EXISTS get_user_winery_data_aggregated() SET search_path = public;
ALTER FUNCTION IF EXISTS get_winery_details_by_id(integer) SET search_path = public;
ALTER FUNCTION IF EXISTS ensure_winery(jsonb) SET search_path = public;

-- 2. Friends
ALTER FUNCTION IF EXISTS get_friends_activity_for_winery(integer) SET search_path = public;
ALTER FUNCTION IF EXISTS get_friends_and_requests() SET search_path = public;
ALTER FUNCTION IF EXISTS send_friend_request(text) SET search_path = public;
ALTER FUNCTION IF EXISTS respond_to_friend_request(uuid, boolean) SET search_path = public;
ALTER FUNCTION IF EXISTS remove_friend(uuid) SET search_path = public;

-- 3. Trips
ALTER FUNCTION IF EXISTS create_trip_with_winery(character varying, date, jsonb, text, uuid[]) SET search_path = public;
ALTER FUNCTION IF EXISTS add_winery_to_trip(integer, jsonb, text) SET search_path = public;
ALTER FUNCTION IF EXISTS remove_winery_from_trip(integer, integer) SET search_path = public;
ALTER FUNCTION IF EXISTS get_paginated_trips_with_wineries(text, integer, integer) SET search_path = public;
ALTER FUNCTION IF EXISTS get_trip_by_id_with_wineries(integer) SET search_path = public;
ALTER FUNCTION IF EXISTS get_trips_for_date(date) SET search_path = public;
ALTER FUNCTION IF EXISTS is_trip_member(integer) SET search_path = public;

-- 4. Visits & Dashboard
ALTER FUNCTION IF EXISTS log_visit(jsonb, jsonb) SET search_path = public;
ALTER FUNCTION IF EXISTS get_all_user_visits_list() SET search_path = public;
ALTER FUNCTION IF EXISTS get_paginated_visits_with_winery_and_friends(integer, integer) SET search_path = public;
ALTER FUNCTION IF EXISTS get_user_dashboard() SET search_path = public;

-- 5. User Actions
ALTER FUNCTION IF EXISTS add_to_wishlist(jsonb) SET search_path = public;
ALTER FUNCTION IF EXISTS toggle_favorite(jsonb) SET search_path = public;
ALTER FUNCTION IF EXISTS toggle_wishlist(jsonb) SET search_path = public;

-- 6. Misc
ALTER FUNCTION IF EXISTS handle_new_user() SET search_path = public;
ALTER FUNCTION IF EXISTS get_friends_ids() SET search_path = public;
ALTER FUNCTION IF EXISTS get_friends_ratings_for_winery(integer) SET search_path = public;
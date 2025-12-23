-- Security Patch: Set search_path = public for all SECURITY DEFINER functions to prevent search_path hijacking.

-- 1. Map & Wineries
ALTER FUNCTION get_map_markers(uuid) SET search_path = public;
ALTER FUNCTION get_user_winery_data_aggregated() SET search_path = public;
ALTER FUNCTION get_winery_details_by_id(integer) SET search_path = public;
ALTER FUNCTION ensure_winery(jsonb) SET search_path = public;

-- 2. Friends
ALTER FUNCTION get_friends_activity_for_winery(integer) SET search_path = public;
ALTER FUNCTION get_friends_and_requests() SET search_path = public;
ALTER FUNCTION send_friend_request(text) SET search_path = public;
ALTER FUNCTION respond_to_friend_request(uuid, boolean) SET search_path = public;
ALTER FUNCTION remove_friend(uuid) SET search_path = public;

-- 3. Trips
ALTER FUNCTION create_trip_with_winery(character varying, date, jsonb, text, uuid[]) SET search_path = public;
ALTER FUNCTION add_winery_to_trip(integer, jsonb, text) SET search_path = public;
ALTER FUNCTION remove_winery_from_trip(integer, integer) SET search_path = public;
ALTER FUNCTION get_paginated_trips_with_wineries(text, integer, integer) SET search_path = public;
ALTER FUNCTION get_trip_by_id_with_wineries(integer) SET search_path = public;
ALTER FUNCTION get_trips_for_date(date) SET search_path = public;
ALTER FUNCTION is_trip_member(integer) SET search_path = public;

-- 4. Visits & Dashboard
ALTER FUNCTION log_visit(jsonb, jsonb) SET search_path = public;
ALTER FUNCTION get_all_user_visits_list() SET search_path = public;
ALTER FUNCTION get_paginated_visits_with_winery_and_friends(integer, integer) SET search_path = public;
ALTER FUNCTION get_user_dashboard() SET search_path = public;

-- 5. User Actions
ALTER FUNCTION add_to_wishlist(jsonb) SET search_path = public;
ALTER FUNCTION toggle_favorite(jsonb) SET search_path = public;
ALTER FUNCTION toggle_wishlist(jsonb) SET search_path = public;

-- 6. Misc
ALTER FUNCTION handle_new_user() SET search_path = public;
ALTER FUNCTION get_friends_ids() SET search_path = public;
ALTER FUNCTION get_friends_ratings_for_winery(integer) SET search_path = public;

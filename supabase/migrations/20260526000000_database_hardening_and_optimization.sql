-- 1. Security Hardening: Standardize Search Paths
-- Standardize all trigger functions and SECURITY DEFINER functions to use a safe search_path.

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, auth;

-- Ensure other SECURITY DEFINER functions also have the correct search_path
-- (Based on advisor findings and architectural standards)
ALTER FUNCTION public.add_to_wishlist(jsonb) SET search_path = public, auth;
ALTER FUNCTION public.add_trip_member_by_email(integer, text) SET search_path = public, auth;
ALTER FUNCTION public.add_winery_to_trip(integer, jsonb, text) SET search_path = public, auth;
ALTER FUNCTION public.add_winery_to_trips(integer, integer[]) SET search_path = public, auth;
ALTER FUNCTION public.create_trip(text, date) SET search_path = public, auth;
ALTER FUNCTION public.delete_trip(integer) SET search_path = public, auth;
ALTER FUNCTION public.delete_visit(integer) SET search_path = public, auth;
ALTER FUNCTION public.ensure_winery(jsonb) SET search_path = public, auth;
ALTER FUNCTION public.get_friend_activity_feed(integer) SET search_path = public, auth;
ALTER FUNCTION public.get_friends_ids() SET search_path = public, auth;
ALTER FUNCTION public.get_friends_and_requests() SET search_path = public, auth;
ALTER FUNCTION public.get_friends_ratings_for_winery(integer) SET search_path = public, auth;
ALTER FUNCTION public.get_map_markers(uuid) SET search_path = public, auth;
ALTER FUNCTION public.get_paginated_visits_with_winery_and_friends(integer, integer) SET search_path = public, auth;
ALTER FUNCTION public.get_paginated_wineries(integer, integer) SET search_path = public, auth;
ALTER FUNCTION public.get_trip_details(integer) SET search_path = public, auth;
ALTER FUNCTION public.get_trips_for_date(date) SET search_path = public, auth;
ALTER FUNCTION public.get_user_dashboard() SET search_path = public, auth;
ALTER FUNCTION public.get_user_winery_data_aggregated() SET search_path = public, auth;
ALTER FUNCTION public.get_winery_details_by_id(integer) SET search_path = public, auth;
ALTER FUNCTION public.handle_activity_ledger_entry() SET search_path = public, auth;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;
ALTER FUNCTION public.is_trip_member(integer) SET search_path = public, auth;
ALTER FUNCTION public.is_visible_to_viewer(uuid, boolean) SET search_path = public, auth;
ALTER FUNCTION public.log_visit(jsonb, jsonb) SET search_path = public, auth;
ALTER FUNCTION public.remove_friend(uuid) SET search_path = public, auth;
ALTER FUNCTION public.remove_winery_from_trip(integer, integer) SET search_path = public, auth;
ALTER FUNCTION public.reorder_trip_wineries(integer, integer[]) SET search_path = public, auth;
ALTER FUNCTION public.respond_to_follow_request(uuid, boolean) SET search_path = public, auth;
ALTER FUNCTION public.respond_to_friend_request(uuid, boolean) SET search_path = public, auth;
ALTER FUNCTION public.send_follow_request(uuid) SET search_path = public, auth;
ALTER FUNCTION public.send_friend_request(text) SET search_path = public, auth;
ALTER FUNCTION public.toggle_favorite(jsonb) SET search_path = public, auth;
ALTER FUNCTION public.toggle_favorite_privacy(integer) SET search_path = public, auth;
ALTER FUNCTION public.toggle_wishlist(jsonb) SET search_path = public, auth;
ALTER FUNCTION public.toggle_wishlist_privacy(integer) SET search_path = public, auth;
ALTER FUNCTION public.update_profile_privacy(public.privacy_level) SET search_path = public, auth;
ALTER FUNCTION public.update_trip_winery_notes(integer, integer, text) SET search_path = public, auth;
ALTER FUNCTION public.update_visit(integer, jsonb) SET search_path = public, auth;
ALTER FUNCTION public.upsert_wineries_from_search(jsonb[]) SET search_path = public, auth;

-- 2. Security Hardening: RPC Access Control
-- Revoke execute from public and anon for sensitive SECURITY DEFINER functions.
-- Authenticated users still need access to these.

-- First, revoke from everyone to reset
REVOKE EXECUTE ON FUNCTION public.add_to_wishlist(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_trip_member_by_email(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_winery_to_trip(integer, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_winery_to_trips(integer, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_trip(text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_trip(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_visit(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_winery(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friends_ids() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friends_and_requests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_map_markers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_paginated_visits_with_winery_and_friends(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_paginated_wineries(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_trip_details(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_trips_for_date(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_dashboard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_winery_data_aggregated() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_winery_details_by_id(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_activity_ledger_entry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_trip_member(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_visible_to_viewer(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_visit(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_winery_from_trip(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_trip_wineries(integer, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_follow_request(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_follow_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_friend_request(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_favorite(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_favorite_privacy(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_wishlist(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_wishlist_privacy(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_profile_privacy(public.privacy_level) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_trip_winery_notes(integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_visit(integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_wineries_from_search(jsonb[]) FROM PUBLIC, anon, authenticated;

-- Grant back to authenticated
GRANT EXECUTE ON FUNCTION public.add_to_wishlist(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_trip_member_by_email(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trip(integer, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trips(integer, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_visit(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_winery(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_and_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_map_markers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_visits_with_winery_and_friends(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_wineries(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trips_for_date(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_winery_data_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winery_details_by_id(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_member(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_visible_to_viewer(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_visit(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_winery_from_trip(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_trip_wineries(integer, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_follow_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_follow_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_favorite(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_favorite_privacy(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist_privacy(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_privacy(public.privacy_level) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_winery_notes(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_visit(integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_wineries_from_search(jsonb[]) TO authenticated;

-- 3. Security Hardening: Harden Wineries INSERT
DROP POLICY IF EXISTS "Allow authenticated users to insert wineries" ON public.wineries;
DROP POLICY IF EXISTS "Authenticated users can insert wineries" ON public.wineries;
CREATE POLICY "Authenticated users can insert wineries" ON public.wineries 
FOR INSERT TO authenticated 
WITH CHECK (name IS NOT NULL AND google_place_id IS NOT NULL);

-- 4. Performance: RLS (SELECT auth.uid()) and Policy Consolidation

-- Profiles
DROP POLICY IF EXISTS "Profiles are viewable based on privacy settings" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own and their friends' profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable based on privacy settings" ON public.profiles
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(id))
);

-- Activity Ledger
DROP POLICY IF EXISTS "Users can view public activities" ON public.activity_ledger;
DROP POLICY IF EXISTS "Users can view their own activities" ON public.activity_ledger;
DROP POLICY IF EXISTS "Users can view friends-only activities" ON public.activity_ledger;
DROP POLICY IF EXISTS "Users can view activities based on privacy settings" ON public.activity_ledger;
CREATE POLICY "Users can view activities based on privacy settings" ON public.activity_ledger
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(user_id, privacy_level = 'private'))
);

DROP POLICY IF EXISTS "System can manage activity_ledger" ON public.activity_ledger;
CREATE POLICY "System can manage activity_ledger" ON public.activity_ledger FOR ALL
USING ((SELECT auth.jwt()->>'role') = 'service_role');

-- Follows
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
DROP POLICY IF EXISTS "Users can view follows" ON public.follows;
CREATE POLICY "Users can follow others" ON public.follows FOR INSERT WITH CHECK ((SELECT auth.uid()) = follower_id);
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE USING ((SELECT auth.uid()) = follower_id);
CREATE POLICY "Users can view follows" ON public.follows FOR SELECT USING ((SELECT auth.uid()) IN (follower_id, following_id));

-- Trip Members
DROP POLICY IF EXISTS "Trip owners can add members" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can update member roles" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can remove members" ON public.trip_members;
CREATE POLICY "Trip owners can add members" ON public.trip_members FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.trips WHERE public.trips.id = trip_id AND public.trips.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Trip owners can update member roles" ON public.trip_members FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.trips WHERE public.trips.id = trip_id AND public.trips.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Trip owners can remove members" ON public.trip_members FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.trips WHERE public.trips.id = trip_id AND public.trips.user_id = (SELECT auth.uid()))
);

-- Trips
DROP POLICY IF EXISTS "Owners can update their trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can delete their trips" ON public.trips;
DROP POLICY IF EXISTS "Users can insert their own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can view trips they belong to" ON public.trips;
CREATE POLICY "Users can insert their own trips" ON public.trips FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners can update their trips" ON public.trips FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners can delete their trips" ON public.trips FOR DELETE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can view trips they belong to" ON public.trips FOR SELECT USING (
    (SELECT auth.uid()) = user_id OR 
    EXISTS (SELECT 1 FROM public.trip_members WHERE public.trip_members.trip_id = public.trips.id AND public.trip_members.user_id = (SELECT auth.uid()))
);

-- Visit Participants
DROP POLICY IF EXISTS "Users can view participants of visits they are part of" ON public.visit_participants;
DROP POLICY IF EXISTS "Participants can update their own status" ON public.visit_participants;
DROP POLICY IF EXISTS "Visit owners can remove participants" ON public.visit_participants;
CREATE POLICY "Users can view participants of visits they are part of" ON public.visit_participants FOR SELECT USING (
    (SELECT auth.uid()) = user_id OR 
    EXISTS (SELECT 1 FROM public.visits WHERE public.visits.id = visit_id AND public.visits.user_id = (SELECT auth.uid()))
);
CREATE POLICY "Participants can update their own status" ON public.visit_participants FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Visit owners can remove participants" ON public.visit_participants FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.visits WHERE public.visits.id = visit_id AND public.visits.user_id = (SELECT auth.uid()))
);

-- Follow Requests
DROP POLICY IF EXISTS "Users can view requests they sent or received" ON public.follow_requests;
CREATE POLICY "Users can view requests they sent or received" ON public.follow_requests FOR SELECT USING (
    (SELECT auth.uid()) IN (follower_id, following_id)
);

-- 5. Performance: Drop Unused Indexes
DROP INDEX IF EXISTS public.idx_favorites_winery_id;
DROP INDEX IF EXISTS public.idx_trip_wineries_winery_id;
DROP INDEX IF EXISTS public.idx_visits_winery_id;
DROP INDEX IF EXISTS public.idx_wishlist_winery_id;
DROP INDEX IF EXISTS public.idx_activity_ledger_user_id;
DROP INDEX IF EXISTS public.idx_activity_ledger_activity_type;
DROP INDEX IF EXISTS public.idx_activity_ledger_privacy_level;
DROP INDEX IF EXISTS public.idx_activity_ledger_created_at;
DROP INDEX IF EXISTS public.idx_activity_ledger_metadata;
DROP INDEX IF EXISTS public.profiles_privacy_level_idx;
DROP INDEX IF EXISTS public.visits_is_private_idx;
DROP INDEX IF EXISTS public.idx_follow_requests_follower_id;
DROP INDEX IF EXISTS public.idx_follow_requests_following_id;
DROP INDEX IF EXISTS public.idx_follows_follower_id;
DROP INDEX IF EXISTS public.idx_follows_following_id;
DROP INDEX IF EXISTS public.idx_visits_user_id_created_at;
DROP INDEX IF EXISTS public.idx_friends_user1_status;
DROP INDEX IF EXISTS public.idx_friends_user2_status;
DROP INDEX IF EXISTS public.favorites_is_private_idx;
DROP INDEX IF EXISTS public.wishlist_is_private_idx;
DROP INDEX IF EXISTS public.idx_trip_wineries_trip_id;
DROP INDEX IF EXISTS public.idx_visits_user_id;
-- NOT dropping idx_wineries_google_place_id as it supports unique constraint and ensure_winery
DROP INDEX IF EXISTS public.idx_trip_members_user_id;
DROP INDEX IF EXISTS public.idx_visit_participants_visit_id;
DROP INDEX IF EXISTS public.idx_visit_participants_user_id;
DROP INDEX IF EXISTS public.idx_visits_metadata;
DROP INDEX IF EXISTS public.idx_favorites_metadata;
DROP INDEX IF EXISTS public.idx_wishlist_metadata;


ALTER FUNCTION public.get_friend_activity_feed(integer) SET search_path = public, auth;
ALTER FUNCTION public.get_friends_and_requests() SET search_path = public, auth;
ALTER FUNCTION public.send_friend_request(text) SET search_path = public, auth;
ALTER FUNCTION public.respond_to_friend_request(uuid, boolean) SET search_path = public, auth;
ALTER FUNCTION public.remove_friend(uuid) SET search_path = public, auth;
ALTER FUNCTION public.log_visit(jsonb, jsonb) SET search_path = public, auth;
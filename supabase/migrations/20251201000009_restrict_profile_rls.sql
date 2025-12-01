-- Restrict RLS on public.profiles to prevent data leak.
-- Renames the permissive policy and then alters it to allow viewing only own profile or friends' profiles.

ALTER POLICY "Public profiles are viewable by everyone." ON public.profiles RENAME TO "Users can view their own and their friends' profiles";

ALTER POLICY "Users can view their own and their friends' profiles" ON public.profiles
FOR SELECT USING (auth.uid() = id OR id IN (SELECT friend_id FROM get_friends_ids()));

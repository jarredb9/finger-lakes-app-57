-- Migration to refactor profile and social privacy
-- Sequential timestamp: 20260302160009

-- 1. Update profiles.privacy_level default to 'public'
ALTER TABLE public.profiles 
ALTER COLUMN privacy_level SET DEFAULT 'public';

-- 2. Update existing 'friends_only' profiles to 'public' to maintain current behavior (as per spec)
UPDATE public.profiles 
SET privacy_level = 'public' 
WHERE privacy_level = 'friends_only';

-- 3. Add is_private to favorites and wishlist for granular control
ALTER TABLE public.favorites 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

ALTER TABLE public.wishlist 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

-- Add indexes
CREATE INDEX IF NOT EXISTS favorites_is_private_idx ON public.favorites (is_private);
CREATE INDEX IF NOT EXISTS wishlist_is_private_idx ON public.wishlist (is_private);

-- 4. Centralized privacy helper function
CREATE OR REPLACE FUNCTION public.is_visible_to_viewer(p_target_user_id uuid, p_is_item_private boolean DEFAULT FALSE)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_target_privacy public.privacy_level;
BEGIN
    -- Owner can always see their own
    IF v_viewer_id = p_target_user_id THEN
        RETURN TRUE;
    END IF;

    -- If the item itself is private, no one else can see it
    IF COALESCE(p_is_item_private, FALSE) THEN
        RETURN FALSE;
    END IF;

    -- Get target profile privacy
    SELECT privacy_level INTO v_target_privacy FROM public.profiles WHERE id = p_target_user_id;

    -- Handle profile-level privacy
    IF v_target_privacy = 'private' THEN
        RETURN FALSE;
    END IF;

    IF v_target_privacy = 'public' THEN
        RETURN TRUE;
    END IF;

    IF v_target_privacy = 'friends_only' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.friends
            WHERE status = 'accepted'
              AND (
                (user1_id = v_viewer_id AND user2_id = p_target_user_id)
                OR
                (user2_id = v_viewer_id AND user1_id = p_target_user_id)
              )
        );
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_visible_to_viewer(uuid, boolean) TO authenticated;

-- 5. Refactor RLS Policies to use the centralized helper

-- Profiles
DROP POLICY IF EXISTS "Profiles are viewable based on privacy settings" ON public.profiles;
CREATE POLICY "Profiles are viewable based on privacy settings" ON public.profiles
FOR SELECT USING (
    public.is_visible_to_viewer(id)
);

-- Visits
DROP POLICY IF EXISTS "Users can view visits based on privacy settings" ON public.visits;
CREATE POLICY "Users can view visits based on privacy settings" ON public.visits
FOR SELECT USING (
    public.is_visible_to_viewer(user_id, is_private)
);

-- Favorites
DROP POLICY IF EXISTS "Users can view their own and friends' favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users can view their own and others favorites based on privacy" ON public.favorites;
DROP POLICY IF EXISTS "Users can view favorites based on privacy settings" ON public.favorites;

CREATE POLICY "Users can view favorites based on privacy settings" ON public.favorites
FOR SELECT USING (
    public.is_visible_to_viewer(user_id, is_private)
);

-- Wishlist
DROP POLICY IF EXISTS "Users can view their own and friends' wishlist items" ON public.wishlist;
DROP POLICY IF EXISTS "Users can view wishlist items based on privacy settings" ON public.wishlist;
CREATE POLICY "Users can view wishlist items based on privacy settings" ON public.wishlist
FOR SELECT USING (
    public.is_visible_to_viewer(user_id, is_private)
);

-- 6. Refactor Social RPCs to avoid redundancy and use consolidated logic

-- Updated get_friend_activity_feed
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_feed jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO v_feed
    FROM (
        SELECT
          'visit'::text as activity_type,
          v.created_at,
          v.user_id as activity_user_id,
          COALESCE(p.name, 'Someone')::text as user_name,
          COALESCE(p.email, 'unknown')::text as user_email,
          w.id as winery_id,
          w.name::text as winery_name,
          v.rating as visit_rating,
          v.user_review as visit_review,
          COALESCE(v.photos, ARRAY[]::text[]) as visit_photos
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        LEFT JOIN public.profiles p ON v.user_id = p.id
        WHERE 
          -- Using the centralized helper
          public.is_visible_to_viewer(v.user_id, v.is_private)
          AND v.user_id != v_user_id -- Don't show self in friend activity feed
          -- Ensure they are friends (feed is for friends activity)
          AND EXISTS (
            SELECT 1 FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user1_id = v_user_id AND f.user2_id = v.user_id)
                OR
                (f.user2_id = v_user_id AND f.user1_id = v.user_id)
              )
          )
        ORDER BY v.created_at DESC
        LIMIT limit_val
    ) t;

    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

-- Updated get_friend_profile_with_visits
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(friend_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_profile jsonb;
BEGIN
    -- Check access using helper
    IF NOT public.is_visible_to_viewer(friend_id_param) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- Build the profile object
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'debug_viewer_id', v_viewer_id, -- KEEP DEBUG FOR NOW TO SEE IN E2E
        'visits', (
            SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    v.id,
                    v.visit_date,
                    v.user_review,
                    v.rating,
                    COALESCE(v.photos, ARRAY[]::text[]) as photos,
                    jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address,
                        'latitude', w.latitude,
                        'longitude', w.longitude
                    ) as wineries
                FROM public.visits v
                JOIN public.wineries w ON v.winery_id = w.id
                WHERE v.user_id = friend_id_param
                  -- Use helper for visit visibility
                  AND public.is_visible_to_viewer(friend_id_param, v.is_private)
                ORDER BY v.visit_date DESC
            ) v_data
        ),
        'stats', jsonb_build_object(
            'visit_count', (SELECT count(*) FROM public.visits WHERE user_id = friend_id_param AND public.is_visible_to_viewer(friend_id_param, is_private)),
            'wishlist_count', (SELECT count(*) FROM public.wishlist WHERE user_id = friend_id_param AND public.is_visible_to_viewer(friend_id_param, is_private)),
            'favorite_count', (SELECT count(*) FROM public.favorites WHERE user_id = friend_id_param AND public.is_visible_to_viewer(friend_id_param, is_private))
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = friend_id_param;

    RETURN v_profile;
END;
$$;

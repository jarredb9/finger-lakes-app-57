-- Update is_visible_to_viewer to include asymmetric follows
CREATE OR REPLACE FUNCTION public.is_visible_to_viewer(p_target_user_id uuid, p_is_item_private boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_target_privacy public.privacy_level;
BEGIN
    -- 1. Owner can always see their own
    IF v_viewer_id = p_target_user_id THEN
        RETURN TRUE;
    END IF;

    -- 2. If the item itself is private, no one else can see it
    IF COALESCE(p_is_item_private, FALSE) THEN
        RETURN FALSE;
    END IF;

    -- 3. Get target profile privacy
    SELECT privacy_level INTO v_target_privacy FROM public.profiles WHERE id = p_target_user_id;

    -- 4. Profile-level privacy handling
    
    -- If target is private, only owner can see (already handled in step 1)
    IF v_target_privacy = 'private' THEN
        RETURN FALSE;
    END IF;

    -- If target is public, anyone can see non-private items
    IF v_target_privacy = 'public' THEN
        RETURN TRUE;
    END IF;

    -- If target is friends_only, check both mutual friends AND asymmetric follows
    IF v_target_privacy = 'friends_only' THEN
        RETURN EXISTS (
            -- Check mutual friendship
            SELECT 1 FROM public.friends
            WHERE status = 'accepted'
              AND (
                (user1_id = v_viewer_id AND user2_id = p_target_user_id)
                OR
                (user2_id = v_viewer_id AND user1_id = p_target_user_id)
              )
        ) OR EXISTS (
            -- Check asymmetric follow
            SELECT 1 FROM public.follows
            WHERE follower_id = v_viewer_id AND following_id = p_target_user_id
        );
    END IF;

    RETURN FALSE;
END;
$$;

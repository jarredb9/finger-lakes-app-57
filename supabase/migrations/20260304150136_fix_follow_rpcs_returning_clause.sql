-- RPC: send_follow_request (Fixed)
CREATE OR REPLACE FUNCTION public.send_follow_request(p_target_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER;
SET search_path = public
AS $$
DECLARE
    v_privacy_level privacy_level;
    v_already_following BOOLEAN;
BEGIN
    -- 1. Check if already following
    SELECT EXISTS (
        SELECT 1 FROM public.follows 
        WHERE follower_id = auth.uid() AND following_id = p_target_id
    ) INTO v_already_following;

    IF v_already_following THEN
        RETURN json_build_object('status', 'already_following', 'message', 'You are already following this user');
    END IF;

    -- 2. Get target privacy level
    SELECT privacy_level INTO v_privacy_level FROM public.profiles WHERE id = p_target_id;

    IF v_privacy_level IS NULL THEN
        RAISE EXCEPTION 'Target user not found';
    END IF;

    -- 3. Logic based on privacy
    IF v_privacy_level = 'public' THEN
        -- Instant follow
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (auth.uid(), p_target_id)
        ON CONFLICT DO NOTHING;
        
        RETURN json_build_object('status', 'followed', 'message', 'Following started instantly');
    ELSE
        -- Create request
        INSERT INTO public.follow_requests (follower_id, following_id)
        VALUES (auth.uid(), p_target_id)
        ON CONFLICT (follower_id, following_id) DO UPDATE SET status = 'pending';
        
        RETURN json_build_object('status', 'request_sent', 'message', 'Follow request sent');
    END IF;
END;
$$;

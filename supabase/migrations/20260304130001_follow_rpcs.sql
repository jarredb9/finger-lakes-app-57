-- Create follow_requests table
CREATE TABLE IF NOT EXISTS public.follow_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'declined'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- Enable RLS
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

-- Policies for follow_requests
CREATE POLICY "Users can view requests they sent or received"
ON public.follow_requests FOR SELECT
USING (follower_id = auth.uid() OR following_id = auth.uid());

-- RPC: send_follow_request
CREATE OR REPLACE FUNCTION public.send_follow_request(p_target_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

-- RPC: respond_to_follow_request
CREATE OR REPLACE FUNCTION public.respond_to_follow_request(p_follower_id UUID, p_accept BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_exists BOOLEAN;
BEGIN
    -- 1. Verify request exists
    SELECT EXISTS (
        SELECT 1 FROM public.follow_requests 
        WHERE follower_id = p_follower_id AND following_id = auth.uid() AND status = 'pending'
    ) INTO v_request_exists;

    IF NOT v_request_exists THEN
        RETURN json_build_object('status', 'error', 'message', 'Request not found or already processed');
    END IF;

    -- 2. Handle response
    IF p_accept THEN
        -- Add to follows
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (p_follower_id, auth.uid())
        ON CONFLICT DO NOTHING;

        -- Delete request
        DELETE FROM public.follow_requests 
        WHERE follower_id = p_follower_id AND following_id = auth.uid();

        RETURN json_build_object('status', 'accepted', 'message', 'Follow request accepted');
    ELSE
        -- Update/Delete request
        DELETE FROM public.follow_requests 
        WHERE follower_id = p_follower_id AND following_id = auth.uid();

        RETURN json_build_object('status', 'declined', 'message', 'Follow request declined');
    END IF;
END;
$$;

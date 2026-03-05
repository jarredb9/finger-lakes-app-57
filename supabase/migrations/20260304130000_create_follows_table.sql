-- Create follows table for asymmetric relationships
CREATE TABLE IF NOT EXISTS public.follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id),
    CONSTRAINT cannot_follow_self CHECK (follower_id <> following_id)
);

-- Enable RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Policies for follows
CREATE POLICY "Users can view follows"
ON public.follows FOR SELECT
USING (true); -- Follow graph is public by default unless we add privacy tiers to profiles

CREATE POLICY "Users can follow others"
ON public.follows FOR INSERT
WITH CHECK (follower_id = auth.uid());

CREATE POLICY "Users can unfollow"
ON public.follows FOR DELETE
USING (follower_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

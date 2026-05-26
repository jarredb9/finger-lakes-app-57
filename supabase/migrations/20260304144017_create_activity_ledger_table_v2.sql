-- Create activity_ledger table for centralized social feed
CREATE TABLE IF NOT EXISTS public.activity_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL, -- 'visit', 'favorite', 'wishlist', 'trip'
    object_id TEXT NOT NULL, -- Stored as text to accommodate integer (visits/trips) and UUID (future)
    privacy_level TEXT NOT NULL DEFAULT 'public', -- 'public', 'friends_only', 'private'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_ledger ENABLE ROW LEVEL SECURITY;

-- Policies for activity_ledger
CREATE POLICY "Users can view public activities"
ON public.activity_ledger FOR SELECT
USING (privacy_level = 'public');

CREATE POLICY "Users can view their own activities"
ON public.activity_ledger FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can view friends-only activities"
ON public.activity_ledger FOR SELECT
USING (
    privacy_level = 'friends_only'
    AND EXISTS (
        SELECT 1 FROM public.friends
        WHERE status = 'accepted'
        AND (
            (user1_id = auth.uid() AND user2_id = activity_ledger.user_id)
            OR
            (user2_id = auth.uid() AND user1_id = activity_ledger.user_id)
        )
    )
);

CREATE POLICY "System can manage activity_ledger"
ON public.activity_ledger FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_ledger_user_id ON public.activity_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_activity_type ON public.activity_ledger(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_privacy_level ON public.activity_ledger(privacy_level);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_created_at ON public.activity_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_metadata ON public.activity_ledger USING GIN (metadata);

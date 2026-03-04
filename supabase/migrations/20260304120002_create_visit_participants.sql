-- Create visit_participants table for social tagging
CREATE TABLE IF NOT EXISTS public.visit_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id INTEGER NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'tagged', -- 'tagged', 'confirmed', 'declined'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(visit_id, user_id)
);

-- Enable RLS
ALTER TABLE public.visit_participants ENABLE ROW LEVEL SECURITY;

-- Policies for visit_participants
CREATE POLICY "Users can view participants of visits they are part of"
ON public.visit_participants FOR SELECT
USING (
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM public.visits
        WHERE id = visit_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Visit owners can tag participants"
ON public.visit_participants FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.visits
        WHERE id = visit_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Participants can update their own status"
ON public.visit_participants FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Visit owners can remove participants"
ON public.visit_participants FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.visits
        WHERE id = visit_id AND user_id = auth.uid()
    )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_visit_participants_visit_id ON public.visit_participants(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_participants_user_id ON public.visit_participants(user_id);

-- Create trip_members join table
CREATE TABLE IF NOT EXISTS public.trip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id INTEGER NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'joined',
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(trip_id, user_id)
);

-- Enable RLS
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

-- Policies for trip_members
CREATE POLICY "Users can view members of trips they belong to" 
ON public.trip_members FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.trip_members 
        WHERE trip_id = trip_members.trip_id AND user_id = auth.uid()
    )
    OR 
    EXISTS (
        SELECT 1 FROM public.trips
        WHERE id = trip_members.trip_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Trip owners can add members"
ON public.trip_members FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.trips
        WHERE id = trip_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Trip owners can update member roles"
ON public.trip_members FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.trips
        WHERE id = trip_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Trip owners can remove members"
ON public.trip_members FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.trips
        WHERE id = trip_id AND user_id = auth.uid()
    )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON public.trip_members(user_id);

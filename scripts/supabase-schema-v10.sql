-- This script adds the social features.
-- It assumes you are running it on top of the v9 schema.

-- Create the friends table
CREATE TABLE public.friends (
    id SERIAL PRIMARY KEY,
    user1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    user2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user1_id, user2_id)
);

-- Enable RLS on the new table
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- RLS Policies for friends table
CREATE POLICY "Users can view their own friendships" ON public.friends
    FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can insert their own friend requests" ON public.friends
    FOR INSERT WITH CHECK (auth.uid() = user1_id);

CREATE POLICY "Users can update their own friend requests" ON public.friends
    FOR UPDATE USING (auth.uid() = user2_id);

-- Add friends to trips
ALTER TABLE public.trips
ADD COLUMN members UUID[];

-- Update RLS policies for trips to allow members to view and edit
ALTER POLICY "Users can view their own trips" ON public.trips
    USING (auth.uid() = user_id OR auth.uid() = ANY(members));

ALTER POLICY "Users can update their own trips" ON public.trips
    USING (auth.uid() = user_id OR auth.uid() = ANY(members));
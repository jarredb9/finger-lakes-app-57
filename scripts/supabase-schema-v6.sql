-- This script adds the favorites functionality.
-- It assumes you are running it on top of the v5 schema.

-- Create the favorites table
CREATE TABLE public.favorites (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    winery_id INTEGER REFERENCES public.wineries(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, winery_id) -- Ensures a user can only favorite a winery once
);

-- Enable RLS on the new table
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for favorites table
CREATE POLICY "Users can view their own favorite items" ON public.favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorite items" ON public.favorites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorite items" ON public.favorites
    FOR DELETE USING (auth.uid() = user_id);
-- This script adds the wishlist functionality.
-- It assumes you are running it on top of the v4 schema.

-- Create the wishlist table
CREATE TABLE public.wishlist (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    winery_id INTEGER REFERENCES public.wineries(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, winery_id) -- Ensures a user can only add a winery to their list once
);

-- Enable RLS on the new table
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wishlist table
CREATE POLICY "Users can view their own wishlist items" ON public.wishlist
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wishlist items" ON public.wishlist
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wishlist items" ON public.wishlist
    FOR DELETE USING (auth.uid() = user_id);
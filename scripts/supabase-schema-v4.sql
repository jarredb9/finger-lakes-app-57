-- Drop existing tables to start fresh
DROP TABLE IF EXISTS public.visits CASCADE;
DROP TABLE IF EXISTS public.wineries CASCADE;

-- Create wineries reference table first
CREATE TABLE public.wineries (
    id SERIAL PRIMARY KEY,
    google_place_id TEXT UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    website VARCHAR(255),
    google_rating DECIMAL(2, 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create visits table with a foreign key to the wineries table
CREATE TABLE public.visits (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    winery_id INTEGER REFERENCES public.wineries(id) ON DELETE CASCADE NOT NULL,
    visit_date DATE NOT NULL,
    user_review TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    photos TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on both tables
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wineries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for visits table
CREATE POLICY "Users can view their own visits" ON public.visits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own visits" ON public.visits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own visits" ON public.visits
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own visits" ON public.visits
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for wineries table
CREATE POLICY "Anyone can view wineries" ON public.wineries
    FOR SELECT USING (true);

-- NEW POLICY: Allow authenticated users to insert new wineries
CREATE POLICY "Authenticated users can insert wineries" ON public.wineries
    FOR INSERT TO authenticated WITH CHECK (true);
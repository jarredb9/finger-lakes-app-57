-- This script adds the trip planning functionality.
-- It assumes you are running it on top of the v6 schema.

-- Create the trips table
CREATE TABLE public.trips (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    trip_date DATE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, trip_date) -- Ensures a user can only have one trip per day
);

-- Create the trip_wineries table to link wineries to trips
CREATE TABLE public.trip_wineries (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
    winery_id INTEGER REFERENCES public.wineries(id) ON DELETE CASCADE NOT NULL,
    visit_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trip_id, winery_id)
);

-- Enable RLS on the new tables
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_wineries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trips table
CREATE POLICY "Users can view their own trips" ON public.trips
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trips" ON public.trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trips" ON public.trips
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trips" ON public.trips
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for trip_wineries table
CREATE POLICY "Users can view their own trip wineries" ON public.trip_wineries
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.trips
            WHERE trips.id = trip_wineries.trip_id AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own trip wineries" ON public.trip_wineries
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.trips
            WHERE trips.id = trip_wineries.trip_id AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own trip wineries" ON public.trip_wineries
    FOR UPDATE USING (
        EXISTS (
            SELECT 1
            FROM public.trips
            WHERE trips.id = trip_wineries.trip_id AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own trip wineries" ON public.trip_wineries
    FOR DELETE USING (
        EXISTS (
            SELECT 1
            FROM public.trips
            WHERE trips.id = trip_wineries.trip_id AND trips.user_id = auth.uid()
        )
    );
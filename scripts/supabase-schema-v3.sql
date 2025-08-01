-- Drop existing tables to start fresh
DROP TABLE IF EXISTS public.visits CASCADE;
DROP TABLE IF EXISTS public.wineries CASCADE;

-- Create wineries reference table first
CREATE TABLE public.wineries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    phone VARCHAR(20),
    website VARCHAR(255),
    google_rating DECIMAL(2, 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create visits table with proper UUID reference to auth.users (allowing multiple visits)
CREATE TABLE public.visits (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    winery_id INTEGER REFERENCES public.wineries(id) ON DELETE CASCADE,
    winery_name VARCHAR(255) NOT NULL,
    winery_address TEXT NOT NULL,
    visit_date DATE NOT NULL,
    user_review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    -- NO UNIQUE CONSTRAINT - allows multiple visits to same winery
);

-- Insert sample Finger Lakes wineries
INSERT INTO public.wineries (name, address, latitude, longitude, phone, website, google_rating) VALUES
('Dr. Konstantin Frank Winery', '9749 Middle Rd, Hammondsport, NY 14840', 42.4089, -77.2094, '(607) 868-4884', 'https://drfrankwines.com', 4.6),
('Chateau Lafayette Reneau', '5081 NY-414, Hector, NY 14841', 42.4756, -76.8739, '(607) 546-2062', 'https://clrwine.com', 4.4),
('Wagner Vineyards', '9322 NY-414, Lodi, NY 14860', 42.6089, -76.8267, '(607) 582-6450', 'https://wagnervineyards.com', 4.3),
('Ravines Wine Cellars', '1020 Keuka Lake Rd, Penn Yan, NY 14527', 42.6394, -77.0533, '(315) 536-4265', 'https://ravineswine.com', 4.5),
('Hermann J. Wiemer Vineyard', '3962 NY-14, Dundee, NY 14837', 42.5267, -76.9733, '(607) 243-7971', 'https://wiemer.com', 4.7),
('Fox Run Vineyards', '670 NY-14, Penn Yan, NY 14527', 42.6178, -77.0456, '(315) 536-4616', 'https://foxrunvineyards.com', 4.4);

-- Enable RLS on both tables
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wineries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for visits table
CREATE POLICY "Users can view their own visits" ON public.visits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own visits" ON public.visits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own visits" ON public.visits
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own visits" ON public.visits
    FOR DELETE USING (auth.uid() = user_id);

-- Create policy to allow everyone to read wineries
CREATE POLICY "Anyone can view wineries" ON public.wineries
    FOR SELECT USING (true);

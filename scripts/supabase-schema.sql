-- Create visits table
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    winery_name VARCHAR(255) NOT NULL,
    winery_address TEXT NOT NULL,
    visit_date DATE NOT NULL,
    user_review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, winery_name)
);

-- Enable RLS on visits table
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for visits table
CREATE POLICY "Users can view their own visits" ON public.visits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own visits" ON public.visits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own visits" ON public.visits
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own visits" ON public.visits
    FOR DELETE USING (auth.uid() = user_id);

-- Create wineries reference table (optional, for future use)
CREATE TABLE IF NOT EXISTS public.wineries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    phone VARCHAR(20),
    website VARCHAR(255),
    google_rating DECIMAL(2, 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample Finger Lakes wineries
INSERT INTO public.wineries (name, address, latitude, longitude, phone, website, google_rating) VALUES
('Dr. Konstantin Frank Winery', '9749 Middle Rd, Hammondsport, NY 14840', 42.4089, -77.2094, '(607) 868-4884', 'https://drfrankwines.com', 4.6),
('Chateau Lafayette Reneau', '5081 NY-414, Hector, NY 14841', 42.4756, -76.8739, '(607) 546-2062', 'https://clrwine.com', 4.4),
('Wagner Vineyards', '9322 NY-414, Lodi, NY 14860', 42.6089, -76.8267, '(607) 582-6450', 'https://wagnervineyards.com', 4.3),
('Ravines Wine Cellars', '1020 Keuka Lake Rd, Penn Yan, NY 14527', 42.6394, -77.0533, '(315) 536-4265', 'https://ravineswine.com', 4.5),
('Hermann J. Wiemer Vineyard', '3962 NY-14, Dundee, NY 14837', 42.5267, -76.9733, '(607) 243-7971', 'https://wiemer.com', 4.7),
('Fox Run Vineyards', '670 NY-14, Penn Yan, NY 14527', 42.6178, -77.0456, '(315) 536-4616', 'https://foxrunvineyards.com', 4.4)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS on wineries table
ALTER TABLE public.wineries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow everyone to read wineries
CREATE POLICY "Anyone can view wineries" ON public.wineries
    FOR SELECT USING (true);

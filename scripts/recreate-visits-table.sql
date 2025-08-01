-- Complete recreation of the visits table without any unique constraints
-- This is the most reliable way to ensure no constraints exist

-- First, backup any existing data
CREATE TABLE IF NOT EXISTS visits_backup AS SELECT * FROM public.visits;

-- Drop the existing table completely
DROP TABLE IF EXISTS public.visits CASCADE;

-- Recreate the visits table without any unique constraints
CREATE TABLE public.visits (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    winery_id INTEGER,
    winery_name VARCHAR(255) NOT NULL,
    winery_address TEXT NOT NULL,
    visit_date DATE NOT NULL,
    user_review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    -- NO UNIQUE CONSTRAINTS AT ALL
);

-- Restore data from backup if it exists
INSERT INTO public.visits (user_id, winery_id, winery_name, winery_address, visit_date, user_review, created_at, updated_at)
SELECT user_id, winery_id, winery_name, winery_address, visit_date, user_review, created_at, updated_at
FROM visits_backup
WHERE EXISTS (SELECT 1 FROM visits_backup);

-- Enable RLS
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own visits" ON public.visits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own visits" ON public.visits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own visits" ON public.visits
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own visits" ON public.visits
    FOR DELETE USING (auth.uid() = user_id);

-- Clean up backup table
DROP TABLE IF EXISTS visits_backup;

-- Verify no unique constraints exist
SELECT 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'visits' 
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'UNIQUE';

-- Simplified version of table recreation without backup complexity
-- WARNING: This will delete all existing visit data

-- Drop the existing table completely
DROP TABLE IF EXISTS public.visits CASCADE;

-- Recreate the visits table without any unique constraints
CREATE TABLE public.visits (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    winery_name VARCHAR(255) NOT NULL,
    winery_address TEXT NOT NULL,
    visit_date DATE NOT NULL,
    user_review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint to auth.users
ALTER TABLE public.visits 
ADD CONSTRAINT visits_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

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

-- Final verification - should return no rows
SELECT 
    constraint_name, 
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'visits' 
    AND table_schema = 'public'
    AND constraint_type = 'UNIQUE';

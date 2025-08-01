-- Remove the unique constraint that's preventing multiple visits
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_user_id_winery_name_key;

-- Also remove any other potential unique constraints
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_user_id_winery_id_key;

-- Verify the constraint is gone by checking table constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'public.visits'::regclass 
AND contype = 'u';

-- Show current table structure
\d public.visits;

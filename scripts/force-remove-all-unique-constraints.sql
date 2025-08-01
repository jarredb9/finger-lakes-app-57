-- This script will forcefully remove ALL unique constraints from the visits table
-- Run this if the previous script didn't work

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Loop through all unique constraints on the visits table
    FOR constraint_record IN 
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'visits' 
        AND table_schema = 'public' 
        AND constraint_type = 'UNIQUE'
    LOOP
        -- Drop each unique constraint
        EXECUTE 'ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS ' || constraint_record.constraint_name;
        RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
    END LOOP;
END $$;

-- Verify all unique constraints are gone
SELECT 
    tc.constraint_name, 
    tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_name = 'visits' 
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'UNIQUE';

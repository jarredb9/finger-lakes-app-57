-- Final cleanup: Remove legacy members column from trips table
ALTER TABLE public.trips DROP COLUMN IF EXISTS members;

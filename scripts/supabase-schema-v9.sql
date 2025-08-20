-- This script adds notes to trip wineries.
-- It assumes you are running it on top of the v8 schema.

-- Add a 'notes' column to the trip_wineries table to store visit-specific notes.
ALTER TABLE public.trip_wineries
ADD COLUMN notes TEXT;

-- Update RLS policies to allow users to update their own notes.
-- (The existing policies should already cover this, but it's good practice to review)
-- No new policies are strictly needed as the existing ones on trip_wineries
-- grant access based on the trip's ownership.
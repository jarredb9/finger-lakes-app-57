-- This script enhances the trip planning functionality.
-- It assumes you are running it on top of the v7 schema.

-- Remove the unique constraint on trips table to allow multiple trips per day
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_user_id_trip_date_key;
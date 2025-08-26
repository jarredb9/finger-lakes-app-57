-- This script updates the RLS policies for the trip_wineries table
-- to allow full collaboration from all trip members.

-- Step 1: Create a helper function to check if the current user is a member of a specific trip.
-- This makes the policies cleaner and easier to manage.
CREATE OR REPLACE FUNCTION is_trip_member(trip_id_to_check int)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.trips
        WHERE id = trip_id_to_check
          AND (auth.uid() = user_id OR auth.uid() = ANY(members))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Grant permission for authenticated users to use this new function.
GRANT EXECUTE ON FUNCTION public.is_trip_member(int) TO authenticated;


-- Step 3: Drop all old policies on the trip_wineries table to start clean.
DROP POLICY IF EXISTS "Users can view their own trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Users can insert their own trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Users can update their own trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Users can delete their own trip wineries" ON public.trip_wineries;


-- Step 4: Create new, collaborative policies using the helper function.
-- These policies will grant full permissions (SELECT, INSERT, UPDATE, DELETE)
-- to any user who is a member of the trip.

CREATE POLICY "Trip members can view trip wineries" ON public.trip_wineries
    FOR SELECT USING (is_trip_member(trip_id));

CREATE POLICY "Trip members can add wineries to a trip" ON public.trip_wineries
    FOR INSERT WITH CHECK (is_trip_member(trip_id));

CREATE POLICY "Trip members can update wineries on a trip" ON public.trip_wineries
    FOR UPDATE USING (is_trip_member(trip_id));

CREATE POLICY "Trip members can remove wineries from a trip" ON public.trip_wineries
    FOR DELETE USING (is_trip_member(trip_id));
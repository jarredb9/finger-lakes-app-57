-- Refactor trips and trip_wineries RLS to use the is_trip_member RPC
-- This eliminates dependency on the legacy members array for access control

-- 1. Redefine trips policies
DROP POLICY IF EXISTS "Users can view their own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can update their own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can delete their own trips" ON public.trips;

CREATE POLICY "Users can view trips they belong to" 
ON public.trips FOR SELECT 
USING (public.is_trip_member(id));

CREATE POLICY "Owners can update their trips" 
ON public.trips FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their trips" 
ON public.trips FOR DELETE 
USING (auth.uid() = user_id);

-- 2. Redefine trip_wineries policies
DROP POLICY IF EXISTS "Trip members can view trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Trip members can add wineries to a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Trip members can update wineries on a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Trip members can remove wineries from a trip" ON public.trip_wineries;

CREATE POLICY "Members can view trip wineries" 
ON public.trip_wineries FOR SELECT 
USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can add wineries to a trip" 
ON public.trip_wineries FOR INSERT 
WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update wineries on a trip" 
ON public.trip_wineries FOR UPDATE 
USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can remove wineries from a trip" 
ON public.trip_wineries FOR DELETE 
USING (public.is_trip_member(trip_id));

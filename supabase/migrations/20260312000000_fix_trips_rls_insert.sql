-- Fix RLS policies for trips table to prevent 42501 errors during INSERT ... RETURNING
-- The issue was that the SELECT policy used a function that queried the same table, 
-- causing recursion or visibility issues during the middle of an INSERT.

-- 1. Update trips INSERT policy to use direct auth.uid() check without subquery
DROP POLICY IF EXISTS "Users can insert their own trips" ON public.trips;
CREATE POLICY "Users can insert their own trips" 
ON public.trips FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 2. Update trips SELECT policy to allow owners directly
-- This avoids calling is_trip_member(id) for the owner, fixing the RETURNING clause issue.
DROP POLICY IF EXISTS "Users can view trips they belong to" ON public.trips;
CREATE POLICY "Users can view trips they belong to" 
ON public.trips FOR SELECT 
USING (auth.uid() = user_id OR public.is_trip_member(id));

-- 3. Optimization: Update trip_members SELECT policy to allow owners directly as well
DROP POLICY IF EXISTS "Users can view members of trips they belong to" ON public.trip_members;
CREATE POLICY "Users can view members of trips they belong to" 
ON public.trip_members FOR SELECT 
USING (auth.uid() = user_id OR public.is_trip_member(trip_id));

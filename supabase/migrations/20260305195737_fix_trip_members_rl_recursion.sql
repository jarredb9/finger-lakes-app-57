-- Fix infinite recursion in trip_members RLS policy
-- The previous policy performed a raw SELECT on trip_members within its own USING clause

DROP POLICY IF EXISTS "Users can view members of trips they belong to" ON public.trip_members;

CREATE POLICY "Users can view members of trips they belong to" 
ON public.trip_members FOR SELECT 
USING (
    public.is_trip_member(trip_id)
);

-- Hardening is_trip_member usage and ensuring explicit public schema prefixing
-- This aligns with the architectural mandate to use explicit schema prefixes for security.

-- 1. Ensure is_trip_member itself has the correct search_path
ALTER FUNCTION public.is_trip_member(int) SET search_path = public, auth;

-- 2. Audit and fix any RLS policies that might still use un-prefixed is_trip_member
-- Even though recent migrations refactored these, we re-apply them with explicit public prefix to be certain.

-- trips table
DROP POLICY IF EXISTS "Users can view trips they belong to" ON public.trips;
CREATE POLICY "Users can view trips they belong to" 
ON public.trips FOR SELECT 
USING (public.is_trip_member(id));

-- trip_wineries table
DROP POLICY IF EXISTS "Members can view trip wineries" ON public.trip_wineries;
CREATE POLICY "Members can view trip wineries" 
ON public.trip_wineries FOR SELECT 
USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS "Members can add wineries to a trip" ON public.trip_wineries;
CREATE POLICY "Members can add wineries to a trip" 
ON public.trip_wineries FOR INSERT 
WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS "Members can update wineries on a trip" ON public.trip_wineries;
CREATE POLICY "Members can update wineries on a trip" 
ON public.trip_wineries FOR UPDATE 
USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS "Members can remove wineries from a trip" ON public.trip_wineries;
CREATE POLICY "Members can remove wineries from a trip" 
ON public.trip_wineries FOR DELETE 
USING (public.is_trip_member(trip_id));

-- 3. Audit all RPCs that use is_trip_member and ensure they set search_path
-- This is a broader security measure beyond just the prefix.

DO $$
DECLARE
    rpc_record RECORD;
BEGIN
    FOR rpc_record IN 
        SELECT 
            p.proname as rpc_name,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND prosrc ILIKE '%is_trip_member%'
    LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, auth', rpc_record.rpc_name, rpc_record.args);
    END LOOP;
END $$;

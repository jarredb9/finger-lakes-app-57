-- Security Patch: Fix remaining insecure RPCs
-- Targets overloaded functions missed in previous patch

DO $$
BEGIN

    -- 1. get_map_markers (No-arg version from 20251205)
    BEGIN
        ALTER FUNCTION get_map_markers() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function get_map_markers() not found, skipping.';
    END;

    -- 2. add_winery_to_trip (Old version from 20251201 with winery_id as int)
    BEGIN
        ALTER FUNCTION add_winery_to_trip(integer, integer, text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function add_winery_to_trip(integer, integer, text) not found, skipping.';
    END;

END $$;

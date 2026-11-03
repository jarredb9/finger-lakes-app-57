-- scripts/db/verify-security-advisor.sql
-- Verification harness asserting zero violations for Supabase Security Advisor categories:
--   0026: pg_graphql_anon_table_exposed
--   0027: pg_graphql_authenticated_table_exposed
--   0028: anon_security_definer_function_executable
--   0029: authenticated_security_definer_function_executable
-- Also validates ADR-0007 allowlist invariants and RPC status.

DO $$
DECLARE
  v_count integer;
  v_details text;
BEGIN
  RAISE NOTICE 'Starting Security Advisor catalog verification...';

  -- ---------------------------------------------------------------------------
  -- 1. Category 0026 & 0027: pg_graphql extension & public table exposure
  -- ---------------------------------------------------------------------------
  -- 1a. Assert pg_graphql extension is completely dropped
  SELECT count(*) INTO v_count
  FROM pg_extension
  WHERE extname = 'pg_graphql';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Category 0026/0027 Violation: pg_graphql extension is still installed in database';
  END IF;

  -- 1b. Assert no tables exist in graphql_public schema
  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'graphql_public';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Category 0026/0027 Violation: tables exposed in graphql_public schema';
  END IF;

  -- 1c. Assert anon role has zero table grants on schema public
  SELECT count(*) INTO v_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee = 'anon';

  IF v_count > 0 THEN
    SELECT string_agg(table_name || ' (' || privilege_type || ')', ', ') INTO v_details
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon';
    RAISE EXCEPTION 'Category 0026 Violation: anon has direct table grants on public: %', v_details;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. Category 0028: anon_security_definer_function_executable
  -- ---------------------------------------------------------------------------
  -- Assert zero SECURITY DEFINER functions in schema public are executable by anon or PUBLIC
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef = true
    AND n.nspname = 'public'
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('public', p.oid, 'EXECUTE')
    );

  IF v_count > 0 THEN
    SELECT string_agg(p.proname, ', ') INTO v_details
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('public', p.oid, 'EXECUTE')
      );
    RAISE EXCEPTION 'Category 0028 Violation: % SECURITY DEFINER function(s) executable by anon/public: %', v_count, v_details;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Category 0029: authenticated_security_definer_function_executable
  -- ---------------------------------------------------------------------------
  -- Assert that non-trigger SECURITY DEFINER functions executable by authenticated
  -- are strictly confined to the ADR-0007 boundary allowlist of 7 functions.
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef = true
    AND n.nspname = 'public'
    AND p.prorettype != 'trigger'::regtype
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname NOT IN (
      'ensure_winery',
      'is_visible_to_viewer',
      'is_trip_member',
      'add_trip_member_by_email',
      'send_friend_request',
      'get_friends_and_requests',
      'get_trip_details'
    );

  IF v_count > 0 THEN
    SELECT string_agg(p.proname, ', ') INTO v_details
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND p.prorettype != 'trigger'::regtype
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'ensure_winery',
        'is_visible_to_viewer',
        'is_trip_member',
        'add_trip_member_by_email',
        'send_friend_request',
        'get_friends_and_requests',
        'get_trip_details'
      );
    RAISE EXCEPTION 'Category 0029 Violation: Unauthorized SECURITY DEFINER function(s) executable by authenticated: %', v_details;
  END IF;

  -- 3b. Verify trigger functions are not executable by authenticated
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('handle_new_user', 'handle_activity_ledger_notification')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_count > 0 THEN
    SELECT string_agg(p.proname, ', ') INTO v_details
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('handle_new_user', 'handle_activity_ledger_notification')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
    RAISE EXCEPTION 'Trigger Privilege Violation: Trigger function(s) executable by authenticated: %', v_details;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Invariant: Dropped Legacy RPCs
  -- ---------------------------------------------------------------------------
  -- Assert 10 dead/deprecated RPCs are completely absent from pg_proc
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'upsert_wineries_from_search',
      'get_all_user_visits_list',
      'get_user_dashboard',
      'get_user_winery_data_aggregated',
      'get_winery_details',
      'get_wineries_in_bounds',
      'add_winery_to_trips',
      'add_to_wishlist',
      'send_follow_request',
      'respond_to_follow_request'
    );

  IF v_count > 0 THEN
    SELECT string_agg(p.proname, ', ') INTO v_details
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'upsert_wineries_from_search',
        'get_all_user_visits_list',
        'get_user_dashboard',
        'get_user_winery_data_aggregated',
        'get_winery_details',
        'get_wineries_in_bounds',
        'add_winery_to_trips',
        'add_to_wishlist',
        'send_follow_request',
        'respond_to_follow_request'
      );
    RAISE EXCEPTION 'Dropped RPC Invariant Violation: Found lingering dead RPCs: %', v_details;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. Invariant: User-Facing RPCs Converted to SECURITY INVOKER
  -- ---------------------------------------------------------------------------
  -- Assert none of the 26 converted RPCs have prosecdef = true
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.proname IN (
      'get_map_markers',
      'get_paginated_wineries',
      'get_winery_details_by_id',
      'get_trips_for_date',
      'get_friend_activity_feed',
      'get_friend_profile_with_visits',
      'get_friends_activity_for_winery',
      'get_friends_ratings_for_winery',
      'create_trip',
      'create_trip_with_winery',
      'delete_trip',
      'add_winery_to_trip',
      'remove_winery_from_trip',
      'reorder_trip_wineries',
      'update_trip_winery_notes',
      'log_visit',
      'update_visit',
      'delete_visit',
      'toggle_favorite',
      'toggle_wishlist',
      'toggle_favorite_privacy',
      'toggle_wishlist_privacy',
      'update_profile_privacy',
      'remove_friend',
      'respond_to_friend_request'
    );

  IF v_count > 0 THEN
    SELECT string_agg(p.proname, ', ') INTO v_details
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'get_map_markers',
        'get_paginated_wineries',
        'get_winery_details_by_id',
        'get_trips_for_date',
        'get_friend_activity_feed',
        'get_friend_profile_with_visits',
        'get_friends_activity_for_winery',
        'get_friends_ratings_for_winery',
        'create_trip',
        'create_trip_with_winery',
        'delete_trip',
        'add_winery_to_trip',
        'remove_winery_from_trip',
        'reorder_trip_wineries',
        'update_trip_winery_notes',
        'log_visit',
        'update_visit',
        'delete_visit',
        'toggle_favorite',
        'toggle_wishlist',
        'toggle_favorite_privacy',
        'toggle_wishlist_privacy',
        'update_profile_privacy',
        'remove_friend',
        'respond_to_friend_request'
      );
    RAISE EXCEPTION 'Security Invoker Invariant Violation: Converted RPCs still marked SECURITY DEFINER: %', v_details;
  END IF;

  RAISE NOTICE 'NOTICE: All Security Advisor checks (0026, 0027, 0028, 0029) passed with 0 violations.';
END $$;
